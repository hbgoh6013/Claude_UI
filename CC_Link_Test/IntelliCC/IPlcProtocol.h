#pragma once

#include<iostream>
#include<queue>
#include<vector>
#include<mutex>
#include<condition_variable>
#include<unordered_map>
#include <QtWidgets/QtWidgets>


class IPlcProtocol : public QObject
{
	Q_OBJECT

signals:
	void newValuesBatch(const std::vector<short> &dataBuf,
		int tabNo, int size, int vecCnt,
		QString currentTime);
	void newValuesRand(const std::vector<short> &dataBuf,
		int tabNo, int size, QString currentTime,
		const std::vector<int> &ids);

	void finished();
public slots:

	virtual bool nConnect() = 0;
	virtual bool isConnected() = 0;

	virtual void nRead() = 0;
	virtual void nWrite() = 0;
	virtual void nLoad() = 0;

	virtual void nStart() = 0;
	virtual void nStop() = 0;
	virtual void nAddress(int tabNo) = 0;
public:
	virtual ~IPlcProtocol() = default;

	
protected:

	// 수신된 데이터를 담는 컨테이너 타입 변경이 필요..
	// 프로토콜별로 공통으로 담을수 있는 컨테이너 ex) vector<double>
	struct NodeDataSet
	{
		std::string dataReadTime;
		std::unordered_map<std::string, std::string> nodeNData;
	};
	std::queue<NodeDataSet> m_data;
	QVector<QVector<double>> m_tableViewData;

	std::mutex m_clientMutex;
	std::mutex m_mutex;
	std::mutex m_tableViewMutex;
	std::condition_variable m_cv;
	std::condition_variable m_tableCv;

	QElapsedTimer m_elapsed;

};

