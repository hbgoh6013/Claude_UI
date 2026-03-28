#pragma once

/*
 * WebSocketServer - QtNetwork 기반 WebSocket 서버
 *
 * Qt WebSockets 모듈 없이 QtNetwork(QTcpServer)만으로 동작
 * Qt 5.12+ / Qt 6.x 양쪽 호환
 * 어떤 C++ Qt 프로젝트에든 재사용 가능
 *
 * 사용법:
 *   WebSocketServer *server = new WebSocketServer(8080, this);
 *   server->start();
 *   server->sendData(jsonObject);
 */

#include <QObject>
#include <QTcpServer>
#include <QTcpSocket>
#include <QList>
#include <QJsonObject>
#include <QJsonDocument>
#include <QJsonArray>
#include <QByteArray>
#include <QCryptographicHash>

class WebSocketServer : public QObject
{
    Q_OBJECT

public:
    explicit WebSocketServer(quint16 port = 8080, QObject *parent = nullptr);
    ~WebSocketServer();

    bool start();
    void stop();
    bool isListening() const;
    int clientCount() const;

public slots:
    void sendData(const QJsonObject &data);

signals:
    void clientConnected(const QString &address);
    void clientDisconnected(const QString &address);
    void serverError(const QString &error);

private slots:
    void onNewConnection();
    void onClientData();
    void onClientDisconnected();

private:
    // WebSocket 핸드셰이크 처리
    bool processHandshake(QTcpSocket *socket, const QByteArray &data);

    // WebSocket 프레임 생성 (텍스트)
    QByteArray createTextFrame(const QByteArray &payload);

    // 클라이언트 주소 문자열
    QString clientAddress(QTcpSocket *socket) const;

    QTcpServer *m_server;
    QList<QTcpSocket*> m_clients;           // 핸드셰이크 완료된 클라이언트
    QList<QTcpSocket*> m_pendingClients;    // 핸드셰이크 대기 중
    quint16 m_port;
};
