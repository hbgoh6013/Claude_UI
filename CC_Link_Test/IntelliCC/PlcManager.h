#pragma once
//	PlcManager
//	���� IPlcProtocol 
//		���� OpcUaProtocol
//		���� McProtocol
//		���� FinsProtocol
//		���� S7Protocol

// strategy : � ���������� ����� ���ΰ�
// CoR : ��� ��/�Ŀ� �������� �ؾ�����
#include "CCLink.h"
#include <QtWidgets/QtWidgets>
#include <iostream>
#include "Global.h"
#include "CsvLog.h"
//#include<queue>

class WebSocketServer;

class PlcManager : public QObject
{
	Q_OBJECT

signals:
	void newValue(QVector<QVector<double>> data);
	void finished();
public slots:

private:
	QThread *m_thread, *m_csvThread, *m_leakAlgo;
	IPlcProtocol *m_threadProt;
	CsvLog *m_csv;
	int m_tabNo;
	WebSocketServer *m_wsServer;
public:

	PlcManager(QObject *parent = nullptr);
	~PlcManager();

	void setWebSocketServer(WebSocketServer *ws) { m_wsServer = ws; }
	void init();
	bool checkConnection();
	void startRecv();
	void stopRecv();
	void loadData();
	void parseDevice();
	void currentTab(int tabNo);
};

