#include "Global.h"
#include <QMetaObject>

Settings *g_settings;
SystemSettings g_systemSettings;
QWidget *g_mainWindow;
QVector<PlcManager*> g_plcManager;

PLC_Info g_plcs;
CCLink_Info g_ccInfo;
OPCUA_Info g_opcInfo;

QVector<AddressList> g_addressList;
QVector<AddressList> g_addressListW;

QString g_baseDir;
QString g_logDir;

QVector<Tabs> g_tabs;

void addLog(const QString &text)
{
	QMetaObject::invokeMethod(g_mainWindow, "slotLog", Qt::QueuedConnection, Q_ARG(QString, text));
}