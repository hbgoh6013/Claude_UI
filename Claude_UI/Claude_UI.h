#pragma once

#include <QtWidgets/QMainWindow>
#include <QTimer>
#include "ui_Claude_UI.h"
#include "WebSocketServer.h"

class Claude_UI : public QMainWindow
{
    Q_OBJECT

public:
    Claude_UI(QWidget *parent = nullptr);
    ~Claude_UI();

private slots:
    /// 1초마다 호출되어 PLC 데이터를 웹 UI에 전송
    void sendPlcData();

private:
    Ui::Claude_UIClass ui;

    WebSocketServer *m_wsServer;   // WebSocket 서버
    QTimer          *m_dataTimer;  // 데이터 전송 타이머
};
