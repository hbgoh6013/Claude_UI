#include "WebSocketServer.h"
#include <QDebug>

// WebSocket GUID (RFC 6455)
static const char *WS_GUID = "258EAFA5-E914-47DA-95CA-5AB5DC11D65A";

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

    bool success = m_server->listen(QHostAddress::Any, m_port);

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

    for (QTcpSocket *client : m_pendingClients) {
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

        // 핸드셰이크 대기 목록에 추가
        m_pendingClients.append(socket);
    }
}

void WebSocketServer::onClientData()
{
    QTcpSocket *socket = qobject_cast<QTcpSocket*>(sender());
    if (!socket) {
        return;
    }

    // 아직 핸드셰이크 안 된 클라이언트인 경우
    if (m_pendingClients.contains(socket)) {
        QByteArray data = socket->readAll();

        if (processHandshake(socket, data)) {
            m_pendingClients.removeAll(socket);
            m_clients.append(socket);

            QString addr = clientAddress(socket);
            qDebug() << "WebSocket client connected:" << addr;
            emit clientConnected(addr);
        } else {
            // 핸드셰이크 실패 - 연결 종료
            socket->close();
        }
    } else {
        // 이미 연결된 클라이언트의 데이터 (Ping/Pong 등)
        // 현재는 서버→클라이언트 단방향이므로 수신 데이터 무시
        socket->readAll();
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
    m_pendingClients.removeAll(socket);
    socket->deleteLater();

    qDebug() << "WebSocket client disconnected:" << addr;
    emit clientDisconnected(addr);
}

bool WebSocketServer::processHandshake(QTcpSocket *socket, const QByteArray &data)
{
    // HTTP 요청에서 Sec-WebSocket-Key 추출
    QString request = QString::fromUtf8(data);

    if (!request.contains("Upgrade: websocket", Qt::CaseInsensitive)) {
        return false;
    }

    // Sec-WebSocket-Key 헤더 추출
    QString key;
    QStringList lines = request.split("\r\n");
    for (const QString &line : lines) {
        if (line.startsWith("Sec-WebSocket-Key:", Qt::CaseInsensitive)) {
            key = line.mid(line.indexOf(':') + 1).trimmed();
            break;
        }
    }

    if (key.isEmpty()) {
        return false;
    }

    // Accept 키 생성 (RFC 6455)
    QByteArray acceptKey = QCryptographicHash::hash(
        (key + WS_GUID).toUtf8(),
        QCryptographicHash::Sha1
    ).toBase64();

    // HTTP 101 응답 전송
    QByteArray response;
    response.append("HTTP/1.1 101 Switching Protocols\r\n");
    response.append("Upgrade: websocket\r\n");
    response.append("Connection: Upgrade\r\n");
    response.append("Sec-WebSocket-Accept: ");
    response.append(acceptKey);
    response.append("\r\n\r\n");

    socket->write(response);
    socket->flush();

    return true;
}

QByteArray WebSocketServer::createTextFrame(const QByteArray &payload)
{
    QByteArray frame;
    int payloadSize = payload.size();

    // FIN=1, opcode=0x1 (텍스트)
    frame.append(static_cast<char>(0x81));

    // Payload 길이
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

    // Payload 데이터
    frame.append(payload);

    return frame;
}

QString WebSocketServer::clientAddress(QTcpSocket *socket) const
{
    if (!socket) {
        return QString();
    }
    return socket->peerAddress().toString()
           + ":" + QString::number(socket->peerPort());
}
