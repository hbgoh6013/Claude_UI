#pragma once
#include <QtWidgets/QtWidgets>
#include <QJsonObject>
#include <QJsonArray>
#include <variant>
//#include"Global.h"

using dataTypes = std::variant<double, std::string>;
typedef std::map<QString, std::vector<dataTypes>> data_t;

class CsvLog :public QObject
{
	Q_OBJECT

private:
	QMutex m_csvMutex, m_algoMutex;
	QString m_filePath;
	bool isInitLog;
	bool m_receiving;
	std::vector<bool> isInitLogBatch;
	std::vector<bool> m_initLogFlag;
	//[Key : name / Value : data]
	data_t m_data;

public:
	CsvLog(QObject *parent = nullptr);
	~CsvLog() = default;

	template<typename T>
	T typeParsingTest(const std::vector<short>& buf, int bytePos);

signals:
	void finished();
	void startInspection(const QString &device, int tabNo);
	void newParsedRow(const QJsonObject &data);
public slots:
	void startLog();

	void onNewValuesBatch(const std::vector<short> &dataBuf,
		int tabNo, int size, int vecCnt,
		QString dateTime);
	void onNewValuesRand(const std::vector<short> &dataBuf,
		int tabNo, int size, QString dateTime, const std::vector<int> &ids);

	void onStartInspection(const QString &device, int tabNo);

};

