#pragma once

/*
 * WebSocketServer - QtNetwork 기반 WebSocket 서버
 *
 * Qt WebSockets 모듈 없이 QtNetwork(QTcpServer)만으로 동작
 * Qt 5.12+ / Qt 6.x 양쪽 호환
 *
 * 추가 기능:
 *   - messageReceived: 클라이언트 → 서버 방향 JSON 수신
 *   - 핸드셰이크 버퍼 누적 (TCP 부분 수신 대응)
 */

#include <QObject>
#include <QTcpServer>
#include <QTcpSocket>
#include <QMap>
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
    void messageReceived(const QString &address, const QJsonObject &message);

private slots:
    void onNewConnection();
    void onClientData();
    void onClientDisconnected();

private:
    bool processHandshake(QTcpSocket *socket, const QByteArray &data);
    QByteArray createTextFrame(const QByteArray &payload);
    QByteArray parseClientFrame(const QByteArray &data);
    QString clientAddress(QTcpSocket *socket) const;

    QTcpServer *m_server;
    QList<QTcpSocket*> m_clients;
    QMap<QTcpSocket*, QByteArray> m_pendingClients;  // 버퍼 누적 (TCP 부분 수신 대응)
    quint16 m_port;
};
