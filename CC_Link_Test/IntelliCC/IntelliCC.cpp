#include "IntelliCC.h"


IntelliCC::IntelliCC(QWidget *parent)
    : QMainWindow(parent)
{
    ui.setupUi(this);
	//logText Widget
	
	g_mainWindow = this;
	m_isRunning = false;

	std::string logPath = g_logDir.toStdString();
	Logger::init(logPath, "logs");

	this->setFixedSize(this->size());
	//ui.ui_log->setMaximumHeight(350);
	ui.ui_log->setReadOnly(true);
	ui.ui_log->setUndoRedoEnabled(false);
	ui.ui_log->setMaximumBlockCount(1000);
	ui.ui_log->moveCursor(QTextCursor::End);
	QMetaObject::invokeMethod(ui.ui_log, [=]() {
		ui.ui_log->moveCursor(QTextCursor::End);
	}, Qt::QueuedConnection);
	slotLog(QString("***** Start Program *****"));

	connect(ui.ui_start, &QPushButton::pressed, this, [=]() {
		emit onStartAcqData();
	});
	connect(ui.ui_stop, &QPushButton::pressed, this, [=]() {
		emit onStopAcqData();
	});
	connect(ui.ui_settings, &QPushButton::pressed, this, [=]() {
		QString configPath = g_baseDir + "/plc_config.json";
		QDesktopServices::openUrl(QUrl::fromLocalFile(configPath));
	});

	g_settings = new Settings;
	g_settings->load();

	// WebSocket server (port 18080 — 8080은 사내 프록시와 충돌 가능)
	m_wsServer = new WebSocketServer(18080, this);
	if (m_wsServer->start()) {
		addLog(QString("WebSocket server started on port 18080"));
	}
	connect(m_wsServer, &WebSocketServer::clientConnected,
			this, &IntelliCC::onClientConnected);
	connect(m_wsServer, &WebSocketServer::messageReceived,
			this, &IntelliCC::onClientMessage);

	// System information reporter (sends every 2 seconds via WebSocket)
	m_sysInfo = new SystemInfo(this);
	connect(m_sysInfo, &SystemInfo::systemInfoReady,
			m_wsServer, &WebSocketServer::sendData);
	m_sysInfo->start(2000);

	connect(ui.ui_load, &QPushButton::pressed, this, [=]() {
		emit onLoad();
	});

	//initTray();
}

IntelliCC::~IntelliCC()
{}

void IntelliCC::slotLog(const QString &text)
{
	QTextCursor cursor(ui.ui_log->document());
	cursor.movePosition(QTextCursor::End);

	QTextCharFormat format;
	format.setForeground(Qt::black);
	
	QString now = QDateTime::currentDateTime().toString("[yyyy-MM-dd hh:mm:ss.zzz] ");
	cursor.insertText(now + text + "\n", format);
	ui.ui_log->ensureCursorVisible();
}


void IntelliCC::onStartAcqData()
{
	if (m_isRunning) {
		addLog(QString("Already Started.."));
		QMessageBox::critical(this, "Error", "System is running.\n\nPress 'Stop' button ");
		return;
	}

	m_isRunning = true;
	g_plcManager.resize(g_tabs.size());
	for (int i = 0; i < g_plcManager.size(); i++)
	{
		g_plcManager[i] = new PlcManager(this);
		g_plcManager[i]->currentTab(i);
		g_plcManager[i]->setWebSocketServer(m_wsServer);
		g_plcManager[i]->startRecv();

		connect(g_plcManager[i], &PlcManager::finished, g_plcManager[i], &QObject::deleteLater);
		connect(g_plcManager[i], &PlcManager::finished, this, [&] {
			for (auto plc : g_plcManager) {
				g_plcManager.removeOne(plc);
			}});
	}
}

void IntelliCC::onStopAcqData()
{
	if (!m_isRunning) {
		QMessageBox::critical(this, "Error", "Press 'Start' button to run PLC first");
		return;
	}

	for (int i = 0; i < g_plcManager.size(); i++)
	{
		g_plcManager[i]->stopRecv();


		//if (g_plcManager[i]->checkConnection())
		//	g_plcManager[i]->stopRecv();
		//else
		//	QMessageBox::critical(this, "Error", QString("PLC%1 is not connected.").arg(i+1));
	}
	//g_plcManager.clear();
	m_isRunning = false;
}

void IntelliCC::onLoad()
{
	g_settings->load();
}

void IntelliCC::onClientConnected(const QString &address)
{
	addLog(QString("WebSocket client connected: %1").arg(address));

	// Send current address configuration to the newly connected client
	QJsonArray addrs;
	if (!g_tabs.isEmpty()) {
		for (const auto &a : g_tabs[0].addressRead) {
			QString dtStr;
			switch (a.dataType) {
			case AddressList::Bit:        dtStr = "Bit";    break;
			case AddressList::Word:       dtStr = "Word";   break;
			case AddressList::DoubleWord: dtStr = "DWord";  break;
			case AddressList::Float:      dtStr = "Float";  break;
			case AddressList::Double:     dtStr = "Double"; break;
			case AddressList::String:     dtStr = "String"; break;
			default:                      dtStr = "Word";   break;
			}
			QJsonObject item;
			item["label"]    = a.label;
			item["device"]   = a.device;
			item["address"]  = static_cast<int>(a.deviceNo);
			item["count"]    = a.count;
			item["dataType"] = dtStr;
			addrs.append(item);
		}
	}
	QJsonObject msg;
	msg["type"]      = "config_sync";
	msg["addresses"] = addrs;
	m_wsServer->sendData(msg);
	addLog(QString("config_sync sent (%1 addresses)").arg(addrs.size()));
}

void IntelliCC::onClientMessage(const QString &address, const QJsonObject &msg)
{
	Q_UNUSED(address)
	if (msg["type"].toString() != "settings_update")
		return;

	QJsonArray addresses = msg["addresses"].toArray();
	g_settings->updateReadAddresses(addresses);
	g_settings->load();
	addLog(QString("plc_config.json updated (%1 addresses)").arg(addresses.size()));

	// Restart active PlcManagers with updated config
	if (m_isRunning) {
		for (auto *pm : g_plcManager) {
			pm->stopRecv();
		}
		for (auto *pm : g_plcManager) {
			pm->setWebSocketServer(m_wsServer);
			pm->startRecv();
		}
	}

	// Send updated config back to all clients as confirmation
	QJsonArray syncAddrs;
	if (!g_tabs.isEmpty()) {
		for (const auto &a : g_tabs[0].addressRead) {
			QString dtStr;
			switch (a.dataType) {
			case AddressList::Bit:        dtStr = "Bit";    break;
			case AddressList::Word:       dtStr = "Word";   break;
			case AddressList::DoubleWord: dtStr = "DWord";  break;
			case AddressList::Float:      dtStr = "Float";  break;
			case AddressList::Double:     dtStr = "Double"; break;
			case AddressList::String:     dtStr = "String"; break;
			default:                      dtStr = "Word";   break;
			}
			QJsonObject item;
			item["label"]    = a.label;
			item["device"]   = a.device;
			item["address"]  = static_cast<int>(a.deviceNo);
			item["count"]    = a.count;
			item["dataType"] = dtStr;
			syncAddrs.append(item);
		}
	}
	QJsonObject syncMsg;
	syncMsg["type"]      = "config_sync";
	syncMsg["addresses"] = syncAddrs;
	m_wsServer->sendData(syncMsg);
}

///**
//* @details ���α׷� ��׶��� ����� ��Ŭ�� context menu â �������̴�.
//* @return void
//*/
//void IntelliCC::initTray()
//{
//	QPixmap pixmap;
//	pixmap.load(":/resources/images/SDI_Kor_Bottom.bmp");
//	QIcon m_TrayIconResource(pixmap);
//	m_trayIcon = new QSystemTrayIcon(m_TrayIconResource, this);
//
//	QMenu * menu = new QMenu(this);
//	QAction * restoreAction = new QAction(tr("&Restore"), this);
//	QAction * quitAction = new QAction(tr("&Quit"), this);
//	connect(restoreAction, &QAction::triggered, this, &QWidget::showNormal);
//	//connect(quitAction, &QAction::triggered, qApp, &QCoreApplication::quit);
//	connect(quitAction, &QAction::triggered, this, &IntelliCC::quitMsgBox);
//	menu->addAction(restoreAction);
//	menu->addAction(quitAction);
//	m_trayIcon->setContextMenu(menu);
//
//	connect(m_trayIcon, &QSystemTrayIcon::activated, this, &IntelliCC::iconActivated);
//
//	m_trayIcon->show();
//}
///**
//* @details ���α׷� ���� ����� 'X'Ŭ���� ��׶��� ������ ���� hide �Լ� �������̴�.
//* @return void
//*/
//void IntelliCC::closeEvent(QCloseEvent *event)
//{
//#ifdef Q_OS_OSX
//	if (!event->spontaneous() || !isVisible()) {
//		return;
//	}
//#endif
//	if (m_trayIcon->isVisible()) {
//		hide();
//		event->ignore();
//	}
//}
///**
//* @details ��׶��� ����� �������� ����Ŭ�� �� ����Ǵ� ��ɿ� ���� �Լ� �������̴�.
//* @return void
//*/
//void IntelliCC::iconActivated(QSystemTrayIcon::ActivationReason reason)
//{
//	switch (reason) {
//		//case QSystemTrayIcon::Trigger:
//	case QSystemTrayIcon::DoubleClick:
//		QWidget::showMaximized();
//		break;
//	default:
//		;
//	}
//}
///**
//* @details ��׶��� �������� ���α׷��� �����ϴ� ��� �ȳ�â�� �˾��Ǵ� �Լ��̴�.
//* @return void
//*/
//void IntelliCC::quitMsgBox()
//{
//	QMessageBox MsgBox;
//	MsgBox.setText("Close Confirmation Exit?");
//	MsgBox.setStandardButtons(QMessageBox::Ok | QMessageBox::Cancel);
//	MsgBox.setDefaultButton(QMessageBox::Ok);
//	if (MsgBox.exec() == QMessageBox::Ok)
//	{
//		qApp->quit();
//	}
//}