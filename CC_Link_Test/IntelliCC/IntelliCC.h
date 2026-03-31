#pragma once
#include<memory>
#include <QtWidgets/QMainWindow>
#include "ui_IntelliCC.h"
#include "CCLink.h"
#include "Global.h"
#include "Settings.h"
#include "WebSocketServer.h"
#include "SystemInfo.h"

class IntelliCC : public QMainWindow
{
    Q_OBJECT

public:
    IntelliCC(QWidget *parent = nullptr);
    ~IntelliCC();

signals:
public slots:
	void slotLog(const QString &text);
	void onStartAcqData();
	void onStopAcqData();
	void onLoad();
	void onClientConnected(const QString &address);
	void onClientMessage(const QString &address, const QJsonObject &msg);
private:
    Ui::IntelliCCClass ui;
	bool m_isRunning;
	WebSocketServer *m_wsServer;
	SystemInfo *m_sysInfo;


/* Ʈ���� ��� */
//private Q_SLOTS:
//	void iconActivated(QSystemTrayIcon::ActivationReason reason);
//	void quitMsgBox();
//protected:
//	void closeEvent(QCloseEvent *event) override;
//private:
//	QSystemTrayIcon *m_trayIcon;
//	void initTray();
};
