#pragma once
#include<iostream>
#include<Windows.h>
#include<queue>
#include<MdFunc.h>
#include<map>
#include<atomic>
#include<variant>
#include <QtWidgets/QtWidgets>

#include"IPlcProtocol.h"
#include"Global.h"

class CCLink : public IPlcProtocol
{
	Q_OBJECT

signals:


public slots:
	bool nConnect() override;
	bool isConnected() override;

	void nRead() override;
	void nWrite() override;
	void nLoad() override;

	void nStart() override;
	void nStop() override;

	void nAddress(int tabNo) override;

public:
	CCLink();
	~CCLink();

	void setMatchTrigger();
	void getRstTargets(const std::vector<short> &data, int id);
	void getRstTargetsR(const std::vector<short> &data, const std::vector<int> &bufIdx,
		std::vector<int> &ids);
	void errCode(long ret);

private:
	long cChanID;                // CC-Link #1
	long cNetworkNo;                // NetworkNo
	long cOwnerStn;              // Read from owner station
	long cRemoteStn;             // Read from remote station
	SHORT RwSize;                 // 2 BYTE
	LONG m_handler;
	
	bool isConnect;
	bool m_run;

	QElapsedTimer restartTimer;

	QMutex m_mutex;
	QMutex m_csvMutex;

	QString m_filePath;
	std::map<int, bool> m_triggerStatus; // <key:ID, Value:On/Off>

	qint64 m_period;
	qint64 m_lastPollTime;

	int m_tabNo;

	int m_testingCnt;
public:

};

