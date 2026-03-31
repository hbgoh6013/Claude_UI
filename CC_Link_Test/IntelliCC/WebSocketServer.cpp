#include "WebSocketServer.h"
#include <QDebug>

// WebSocket GUID (RFC 6455) — QByteArray to avoid QString encoding issues
static const QByteArray WS_GUID("258EAFA5-E914-47DA-95CA-5AB5DC11D65A");

WebSocketServer::WebSocketServer(quint16 port, QObject *parent)
    : QObject(parent)
    , m_server(nullptr)
    , m_port(port)
{
    m_server = new QTcpServer(this);
    connect(m_server, &QTcpServer::newConnection,
            this, &WebSocketServer::onNewConnection);
}

WebSocketServer::~WebSocketServer()
{
    stop();
}

bool WebSocketServer::start()
{
    if (m_server->isListening()) {
        return true;
    }

    bool success = m_server->listen(QHostAddress::LocalHost, m_port);

    if (success) {
        qDebug() << "WebSocket server listening on port" << m_port;
    } else {
        QString err = QString("WebSocket server failed to start on port %1: %2")
                          .arg(m_port)
                          .arg(m_server->errorString());
        qWarning() << err;
        emit serverError(err);
    }

    return success;
}

void WebSocketServer::stop()
{
    for (QTcpSocket *client : m_clients) {
        client->close();
        client->deleteLater();
    }
    m_clients.clear();

    for (QTcpSocket *client : m_pendingClients.keys()) {
        client->close();
        client->deleteLater();
    }
    m_pendingClients.clear();

    if (m_server->isListening()) {
        m_server->close();
        qDebug() << "WebSocket server stopped";
    }
}

bool WebSocketServer::isListening() const
{
    return m_server->isListening();
}

int WebSocketServer::clientCount() const
{
    return m_clients.size();
}

void WebSocketServer::sendData(const QJsonObject &data)
{
    if (m_clients.isEmpty()) {
        return;
    }

    QJsonDocument doc(data);
    QByteArray jsonBytes = doc.toJson(QJsonDocument::Compact);
    QByteArray frame = createTextFrame(jsonBytes);

    for (QTcpSocket *client : m_clients) {
        qDebug() << "[WS] sendData: socket state=" << client->state()
                 << "error=" << client->error();
        client->write(frame);
        client->flush();
    }
}

void WebSocketServer::onNewConnection()
{
    while (m_server->hasPendingConnections()) {
        QTcpSocket *socket = m_server->nextPendingConnection();

        if (!socket) {
            continue;
        }

        connect(socket, &QTcpSocket::readyRead,
                this, &WebSocketServer::onClientData);
        connect(socket, &QTcpSocket::disconnected,
                this, &WebSocketServer::onClientDisconnected);
#if QT_VERSION >= QT_VERSION_CHECK(5, 15, 0)
        connect(socket, &QAbstractSocket::errorOccurred,
#else
        connect(socket, QOverload<QAbstractSocket::SocketError>::of(&QAbstractSocket::error),
#endif
                this, [socket](QAbstractSocket::SocketError err) {
            qDebug() << "[WS] Socket error:" << err << socket->errorString()
                     << "state:" << socket->state();
        });

        // 핸드셰이크 대기 목록에 빈 버퍼로 추가
        m_pendingClients[socket] = QByteArray();
    }
}

void WebSocketServer::onClientData()
{
    QTcpSocket *socket = qobject_cast<QTcpSocket*>(sender());
    if (!socket) {
        return;
    }

    // 핸드셰이크 대기 중인 클라이언트
    if (m_pendingClients.contains(socket)) {
        // 버퍼 누적 (TCP 부분 수신 대응)
        m_pendingClients[socket] += socket->readAll();

        // HTTP 헤더 완료 여부 확인
        if (!m_pendingClients[socket].contains("\r\n\r\n")) {
            return;  // 아직 헤더가 완전히 도착하지 않음
        }

        if (processHandshake(socket, m_pendingClients[socket])) {
            m_pendingClients.remove(socket);
            m_clients.append(socket);

            QString addr = clientAddress(socket);
            qDebug() << "WebSocket client connected:" << addr;
            emit clientConnected(addr);
        } else {
            // 핸드셰이크 실패 - 연결 종료
            m_pendingClients.remove(socket);
            socket->close();
        }
        return;
    }

    // 이미 연결된 클라이언트의 데이터 (settings_update 등)
    QByteArray raw = socket->readAll();

    // Close frame 처리 (RFC 6455 opcode 0x8)
    if (raw.size() >= 2) {
        quint8 opcode = static_cast<quint8>(raw[0]) & 0x0F;
        if (opcode == 0x08) {
            // Close frame 응답 전송 후 소켓 닫기
            QByteArray closeFrame;
            closeFrame.append(static_cast<char>(0x88));  // FIN + Close
            closeFrame.append(static_cast<char>(0x00));  // payload length 0
            socket->write(closeFrame);
            socket->flush();
            socket->close();
            return;
        }
    }

    QByteArray payload = parseClientFrame(raw);
    if (payload.isEmpty()) {
        return;
    }

    QJsonParseError err;
    QJsonDocument doc = QJsonDocument::fromJson(payload, &err);
    if (err.error == QJsonParseError::NoError && doc.isObject()) {
        emit messageReceived(clientAddress(socket), doc.object());
    }
}

void WebSocketServer::onClientDisconnected()
{
    QTcpSocket *socket = qobject_cast<QTcpSocket*>(sender());
    if (!socket) {
        return;
    }

    QString addr = clientAddress(socket);

    m_clients.removeAll(socket);
    m_pendingClients.remove(socket);
    socket->deleteLater();

    qDebug() << "WebSocket client disconnected:" << addr;
    emit clientDisconnected(addr);
}

bool WebSocketServer::processHandshake(QTcpSocket *socket, const QByteArray &data)
{
    QString request = QString::fromUtf8(data);

    qDebug() << "[WS-HS] Received request (" << data.size() << "bytes):";
    qDebug() << "[WS-HS]" << request.left(500);

    if (!request.contains("Upgrade: websocket", Qt::CaseInsensitive)) {
        qDebug() << "[WS-HS] FAIL: No 'Upgrade: websocket' header";
        // 일반 HTTP 요청에 대한 간단한 응답 (디버그용)
        QByteArray httpResp = "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\nWebSocket server OK";
        socket->write(httpResp);
        socket->flush();
        return false;
    }

    QString key;
    QStringList lines = request.split("\r\n");
    for (const QString &line : lines) {
        if (line.startsWith("Sec-WebSocket-Key:", Qt::CaseInsensitive)) {
            key = line.mid(line.indexOf(':') + 1).trimmed();
            break;
        }
    }

    if (key.isEmpty()) {
        qDebug() << "[WS-HS] FAIL: Sec-WebSocket-Key is empty";
        return false;
    }

    // Accept 키 생성 (RFC 6455)
    // QString 인코딩 문제를 피하기 위해 QByteArray만 사용
    QByteArray keyBytes = key.toLatin1();   // base64는 순수 ASCII
    QByteArray hashInput = keyBytes + WS_GUID;
    QByteArray acceptKey = QCryptographicHash::hash(
        hashInput, QCryptographicHash::Sha1
    ).toBase64();

    qDebug() << "[WS-HS] Extracted key:" << keyBytes;
    qDebug() << "[WS-HS] Key length:" << keyBytes.size();
    qDebug() << "[WS-HS] GUID:" << WS_GUID;
    qDebug() << "[WS-HS] GUID length:" << WS_GUID.size();
    qDebug() << "[WS-HS] Hash input length:" << hashInput.size() << "(expected: 60)";
    qDebug() << "[WS-HS] Hash input hex:" << hashInput.toHex();
    qDebug() << "[WS-HS] Accept-Key:" << acceptKey;

    QByteArray response;
    response.append("HTTP/1.1 101 Switching Protocols\r\n");
    response.append("Upgrade: websocket\r\n");
    response.append("Connection: Upgrade\r\n");
    response.append("Sec-WebSocket-Accept: ");
    response.append(acceptKey);
    response.append("\r\n\r\n");

    qDebug() << "[WS-HS] Sending 101 response (" << response.size() << "bytes)";

    qint64 written = socket->write(response);
    socket->flush();

    qDebug() << "[WS-HS] write() returned:" << written << "socket state:" << socket->state();

    return true;
}

QByteArray WebSocketServer::createTextFrame(const QByteArray &payload)
{
    QByteArray frame;
    int payloadSize = payload.size();

    // FIN=1, opcode=0x1 (텍스트)
    frame.append(static_cast<char>(0x81));

    if (payloadSize <= 125) {
        frame.append(static_cast<char>(payloadSize));
    } else if (payloadSize <= 65535) {
        frame.append(static_cast<char>(126));
        frame.append(static_cast<char>((payloadSize >> 8) & 0xFF));
        frame.append(static_cast<char>(payloadSize & 0xFF));
    } else {
        frame.append(static_cast<char>(127));
        for (int i = 7; i >= 0; --i) {
            frame.append(static_cast<char>((payloadSize >> (8 * i)) & 0xFF));
        }
    }

    frame.append(payload);

    return frame;
}

QByteArray WebSocketServer::parseClientFrame(const QByteArray &data)
{
    // RFC 6455: 클라이언트→서버 프레임은 반드시 마스킹됨
    // Frame: [FIN+opcode][MASK+len][extended_len?][mask_key(4)][masked_payload]

    if (data.size() < 6) {
        return {};  // 최소 프레임 크기: 헤더 2 + 마스크키 4
    }

    quint8 byte0 = static_cast<quint8>(data[0]);
    quint8 byte1 = static_cast<quint8>(data[1]);

    // opcode: 0x1=텍스트, 0x8=close, 0x9=ping, 0xA=pong
    quint8 opcode = byte0 & 0x0F;
    if (opcode != 0x01) {
        return {};  // 텍스트 프레임만 처리
    }

    bool masked = (byte1 & 0x80) != 0;
    if (!masked) {
        return {};  // 클라이언트 프레임은 반드시 마스킹됨
    }

    quint64 payloadLen = byte1 & 0x7F;
    int headerSize = 2;

    if (payloadLen == 126) {
        if (data.size() < 4) return {};
        payloadLen = (static_cast<quint64>(static_cast<quint8>(data[2])) << 8)
                   |  static_cast<quint64>(static_cast<quint8>(data[3]));
        headerSize = 4;
    } else if (payloadLen == 127) {
        if (data.size() < 10) return {};
        payloadLen = 0;
        for (int i = 0; i < 8; ++i) {
            payloadLen = (payloadLen << 8) | static_cast<quint64>(static_cast<quint8>(data[2 + i]));
        }
        headerSize = 10;
    }

    // headerSize + 4(마스크키) + payloadLen 만큼 데이터가 있어야 함
    if (static_cast<quint64>(data.size()) < static_cast<quint64>(headerSize) + 4 + payloadLen) {
        return {};
    }

    const char *maskKey      = data.constData() + headerSize;
    const char *maskedPayload = data.constData() + headerSize + 4;

    QByteArray payload(static_cast<int>(payloadLen), '\0');
    for (quint64 i = 0; i < payloadLen; ++i) {
        payload[static_cast<int>(i)] = maskedPayload[i] ^ maskKey[i % 4];
    }

    return payload;
}

QString WebSocketServer::clientAddress(QTcpSocket *socket) const
{
    if (!socket) {
        return QString();
    }
    return socket->peerAddress().toString()
           + ":" + QString::number(socket->peerPort());
}
