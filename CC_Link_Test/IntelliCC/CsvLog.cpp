#include "CsvLog.h"
#include "Global.h"
#include "LeakAlgo.h"


CsvLog::CsvLog(QObject *parent/* = nullptr*/) : QObject(parent)
{
	m_filePath = g_baseDir + "/ResultLog";
	isInitLog = true;
	m_receiving = false;
	isInitLogBatch.assign(100, 1);
	m_initLogFlag.assign(100, false);
	connect(this, &CsvLog::startInspection, this, &CsvLog::onStartInspection);
}


template<typename T>
T CsvLog::typeParsingTest(const std::vector<short>& buf, int bytePos)
{
	T v;
	std::memcpy(&v, &buf[bytePos], sizeof(T));
	return v;
}

void CsvLog::onNewValuesBatch(const std::vector<short> &dataBuf, int tabNo, int size, int vecCnt,
	QString currentTime)
{
	QElapsedTimer timer;
	timer.start();
	
	int dataListSize = g_tabs[tabNo].addressRead.size();
	std::vector<std::vector<double>> dataToDouble(dataListSize);
	QString dataToStr;
	QString header;

	AddressList dataSet = g_tabs[tabNo].addressRead[vecCnt];

	switch (dataSet.dataType) {
	case AddressList::Bit:
	{
		short value = 0;
		int count = dataSet.count;
		// Only for Bit devices
		if (dataSet.devType == DevM || dataSet.devType == DevX || dataSet.devType == DevY || dataSet.devType == DevB) {
			int idxCnt = 0;
			int idx = 1;
			for (int next = 0; next < size; next++) {
				value = typeParsingTest<short>(dataBuf, next);
				int bitMasking = 0;
				for (int i = idx; i <= dataSet.count; i++) {
					bool nextByte = false;
					if (idx % 16 == 0)
						nextByte = true;

					bool b = 0;
					b = ((value >> bitMasking) & 1);

					header += QString("%1(%2%3),").arg(dataSet.label).arg(dataSet.device).arg(dataSet.deviceNo+idxCnt);
					dataToStr += QString("%1,").arg(b);
					//dataToDouble[vecCnt].push_back(static_cast<double>(b));
					idxCnt++;
					idx++;
					bitMasking++;

					if (nextByte)
						break;
				}
			}
		}
		// Read Word devices into bits
		else if (dataSet.devType == DevD || dataSet.devType == DevW) {
			int idxCnt = 0;
			for (int idx = dataSet.bitIndex; idx < count + dataSet.bitIndex; idx++) {
				if (idx > 15)
					break;

				bool b = 0;
				value = typeParsingTest<short>(dataBuf, 0);

				b = ((value >> idx) & 1 );
				header += QString("%1(%2%3.%4),").arg(dataSet.label).arg(dataSet.device).arg(dataSet.deviceNo).arg(dataSet.bitIndex + idxCnt);
				dataToStr += QString("%1,").arg(b);
				//dataToDouble[vecCnt].push_back(static_cast<double>(b));
				idxCnt++;
			}
		}
		break;
	}
	case AddressList::Word:
	{
		int count = dataSet.count;
		for (int i = 0; i < count; i++) {
			short value = typeParsingTest<short>(dataBuf, i);

			header += QString("%1_%2,").arg(dataSet.label).arg(i);
			dataToStr += QString("%1,").arg(value);
			//dataToDouble[vecCnt].push_back(static_cast<double>(value));
		}
		break;
	}
	case AddressList::String:
	{
		int count = dataSet.count;
		std::vector<short> strVec;
		for (int i = 0; i < count; i++) {
			short val = typeParsingTest<short>(dataBuf, i);
			strVec.push_back(val);
		}
		std::string value(reinterpret_cast<const char*>(strVec.data()), strVec.size());

		header += QString("%1,").arg(dataSet.label);
		dataToStr += QString("%1,").arg(QString::fromStdString(value));
		//dataToDouble[vecCnt].push_back(static_cast<double>(9999));
		break;
	}
	case AddressList::DoubleWord:
	{
		int count = dataSet.count;
		for (int i = 0; i < count; i++) {
			long value = typeParsingTest<long>(dataBuf, i * 2);

			header += QString("%1_%2,").arg(dataSet.label).arg(i);
			dataToStr += QString("%1,").arg(value);
			//dataToDouble[vecCnt].push_back(static_cast<double>(value));
		}
		break;
	}
	case AddressList::Float:
	{
		int count = dataSet.count;
		for (int i = 0; i < count; i++) {
			float value = typeParsingTest<float>(dataBuf, i * 2);

			header += QString("%1_%2,").arg(dataSet.label).arg(i);
			dataToStr += QString("%1,").arg(value);
			//dataToDouble[vecCnt].push_back(static_cast<double>(value));
		}
		break;
	}
	case AddressList::Double:
	{
		int count = dataSet.count;
		for (int i = 0; i < count; i++) {
			double value = typeParsingTest<double>(dataBuf, i * 4);

			header += QString("%1_%2,").arg(dataSet.label).arg(count);
			dataToStr += QString("%1,").arg(value);
			//dataToDouble[vecCnt].push_back(value);
		}
		break;
	}
	}

	QString dateTime = QDateTime::currentDateTime().toString("yyyyMMdd");

	QString path = QString("%1/%2").arg(m_filePath).arg(dateTime);
	QDir dir(path);
	if (!dir.exists())
		dir.mkdir(path);

	QFile file(QString("%1/data_%2.csv").arg(path).arg(dataSet.label));
	if (file.open(QIODevice::Append | QIODevice::Text)) {
		QTextStream out(&file);

		if (isInitLogBatch[vecCnt]) {
			out << "[New Cycle]," << header << "\n";
			isInitLogBatch[vecCnt] = false;
		}
		out << currentTime << ",";
		out << dataToStr << ",";
		out << "\n";
	}
	Logger::logger->debug("[block{}] onNewValuesBatch data parsing elapsed {}ms",vecCnt, timer.elapsed());
}

void CsvLog::onNewValuesRand(const std::vector<short> &dataBuf, int tabNo, int size,
	QString currentTime, const std::vector<int> &ids)
{
	QElapsedTimer timer;
	timer.start();

	QString dataToStr;
	QString header;

	int vecCnt = 0;
	QVector<AddressList> dataSets = g_tabs[tabNo].addressRead;
	std::vector<bool> flag = m_initLogFlag;
	QJsonArray wsRegs;

	for (const auto& dataSet : dataSets) {
		// Pass if Master bits are False (bit off)
		bool pass = false;
		for (const auto &idExist : ids) {
			if (dataSet.matchID == idExist) {
				pass = true;
				m_initLogFlag[vecCnt] = true;
				// function works Only For Leak Project
				if (m_data.size() != 0) {
					QString device = dataSet.device + QString::number(dataSet.deviceNo);
					if (dataSet.label.contains("LeakTrig")) {
						emit startInspection(device, tabNo);
					}
				}
				break;
			}
		}
		
		if (pass) {
			vecCnt++;
			continue;
		}
		else
			m_initLogFlag[vecCnt] = false;

		switch (dataSet.dataType) {
		case AddressList::Bit:
		{
			short value = 0;
			int count = dataSet.count;
			// Only for Bit devices
			if (dataSet.devType == DevM || dataSet.devType == DevX || dataSet.devType == DevY || dataSet.devType == DevB) {
				// if bit address counts is over 16, get total buffer elements
				int numOfBytes = 0;
				if ((dataSet.count % 16) > 0)
					numOfBytes = (dataSet.count / 16) + 1;
				else 
					numOfBytes = (dataSet.count / 16);

				int idxCnt = 0;
				int idx = 1;
				for (int next = 0; next < numOfBytes; next++) {
					value = typeParsingTest<short>(dataBuf, vecCnt);
					int bitMasking = 0;
					for (int i = idx; i <= dataSet.count; i++) {
						bool nextByte = false;
						if (idx % 16 == 0)
							nextByte = true;

						bool b = 0;
						b = ((value >> bitMasking) & 1);

						header += QString("%1(%2%3),").arg(dataSet.label).arg(dataSet.device).arg(dataSet.deviceNo + idxCnt);
						dataToStr += QString("%1,").arg(b);

						QString name = QString("%1(%2%3)").arg(dataSet.label).arg(dataSet.device).arg(dataSet.deviceNo + idxCnt);
						m_data[name].push_back(static_cast<double>(b));
						{
							QJsonObject wsReg;
							wsReg["addr"] = dataSet.device + QString::number(dataSet.deviceNo + idxCnt);
							wsReg["value"] = static_cast<double>(b);
							wsRegs.append(wsReg);
						}

						idxCnt++;
						idx++;
						bitMasking++;

						if (nextByte)
							break;
					}
					vecCnt++;
				}
			}
			// Read Word devices into bits
			else if (dataSet.devType == DevD || dataSet.devType == DevW) {
				int idxCnt = 0;
				for (int idx = dataSet.bitIndex; idx < count + dataSet.bitIndex; idx++) {
					if (idx > 15)
						break;

					bool b = 0;
					value = typeParsingTest<short>(dataBuf, vecCnt);

					b = ((value >> idx) & 1);
					header += QString("%1(%2%3.%4),").arg(dataSet.label).arg(dataSet.device).arg(dataSet.deviceNo).arg(dataSet.bitIndex + idxCnt);
					dataToStr += QString("%1,").arg(b);

					QString name = QString("%1(%2%3.%4)").arg(dataSet.label).arg(dataSet.device).arg(dataSet.deviceNo).arg(dataSet.bitIndex + idxCnt);
					m_data[name].push_back(static_cast<double>(b));
					{
						QJsonObject wsReg;
						wsReg["addr"] = dataSet.device + QString::number(dataSet.deviceNo);
						wsReg["value"] = static_cast<double>(b);
						wsRegs.append(wsReg);
					}

					idxCnt++;
				}
				vecCnt++;
			}
			break;
		}
		case AddressList::Word:
		{
			int count = dataSet.count;
			for (int i = 0; i < count; i++) {
				short value = typeParsingTest<short>(dataBuf, vecCnt);

				header += QString("%1_%2,").arg(dataSet.label).arg(i);
				dataToStr += QString("%1,").arg(value);

				QString name = QString("%1_%2").arg(dataSet.label).arg(i);
				m_data[name].push_back(static_cast<double>(value));
				{
					QJsonObject wsReg;
					wsReg["addr"] = dataSet.device + QString::number(dataSet.deviceNo + i);
					wsReg["value"] = static_cast<double>(value);
					wsRegs.append(wsReg);
				}

				vecCnt++;
			}
			break;
		}
		case AddressList::String:
		{
			int count = dataSet.count;
			std::vector<short> strVec;
			for (int i = 0; i < count; i++) {
				short val = typeParsingTest<short>(dataBuf, vecCnt);
				strVec.push_back(val);
				vecCnt++;
			}
			//std::string value(reinterpret_cast<const char*>(strVec.data()), strVec.size());
			std::string value;
			for (short v : strVec)
				value.push_back(static_cast<char>(v));

			header += QString("%1,").arg(dataSet.label);
			dataToStr += QString("%1,").arg(QString::fromStdString(value));

			QString name = QString("%1").arg(dataSet.label);
			m_data[name].push_back(value);

			break;
		}
		case AddressList::DoubleWord:
		{
			int count = dataSet.count;
			for (int i = 0; i < count; i++) {
				long value = typeParsingTest<long>(dataBuf, vecCnt);

				header += QString("%1_%2,").arg(dataSet.label).arg(i);
				dataToStr += QString("%1,").arg(value);

				QString name = QString("%1_%2").arg(dataSet.label).arg(i);
				m_data[name].push_back(static_cast<double>(value));
				{
					QJsonObject wsReg;
					wsReg["addr"] = dataSet.device + QString::number(dataSet.deviceNo + i);
					wsReg["value"] = static_cast<double>(value);
					wsRegs.append(wsReg);
				}

				vecCnt = vecCnt + 2;
			}
			break;
		}
		case AddressList::Float:
		{
			int count = dataSet.count;
			for (int i = 0; i < count; i++) {
				float value = typeParsingTest<float>(dataBuf, i * vecCnt);

				header += QString("%1_%2,").arg(dataSet.label).arg(i);
				dataToStr += QString("%1,").arg(value);

				QString name = QString("%1_%2").arg(dataSet.label).arg(i);
				m_data[name].push_back(static_cast<double>(value));
				{
					QJsonObject wsReg;
					wsReg["addr"] = dataSet.device + QString::number(dataSet.deviceNo + i);
					wsReg["value"] = static_cast<double>(value);
					wsRegs.append(wsReg);
				}

				vecCnt = vecCnt + 2;
			}
			break;
		}
		case AddressList::Double:
		{
			int count = dataSet.count;
			for (int i = 0; i < count; i++) {
				double value = typeParsingTest<double>(dataBuf, vecCnt);

				header += QString("%1_%2,").arg(dataSet.label).arg(count);
				dataToStr += QString("%1,").arg(value);

				QString name = QString("%1_%2").arg(dataSet.label).arg(count);
				m_data[name].push_back(static_cast<double>(value));
				{
					QJsonObject wsReg;
					wsReg["addr"] = dataSet.device + QString::number(dataSet.deviceNo + i);
					wsReg["value"] = value;
					wsRegs.append(wsReg);
				}

				vecCnt = vecCnt + 4;
			}
			break;
		}
		}
	}

	/* m_initLogFlag, flag bool �����̳� ����:
	/* ����ϰ��� �ϴ� ������ �׸��� ��Ʈ�� off�Ǿ� �ȵ��ö� �ش� ������ �׸� index�� false�� ä����
	/* bool �����̳� m_initLogFlag�� ������ ���ŵɶ����� ���� �����ǰų� ���ϴµ�, ���� ���� flag�� ä����
	/* ���� ���ϸ� �Ʒ� equal�Լ����� ĳġ�Ͽ� isInitLog ���� true�� ����
	/* isInitLog�� CSV�� header ǥ���ϴ� flag, �ѹ� header ǥ���ϸ� false�� ����*/
	/* ��, �Ʒ� if���� ����Ŭ���� �����Ͱ� ���Ǵ� ��� csv ���Ͽ� ����Ŭ�� ������ �и��� ���� ��*/
	if (!std::equal(m_initLogFlag.begin(), m_initLogFlag.end(), flag.begin())){
		isInitLog = true;
		addLog(QString("PLC%1 New Values Receieved..").arg(tabNo + 1));
		qDebug() << "no equal";
	}

	if (dataToStr.isEmpty())
		return;

	QString dateTime = QDateTime::currentDateTime().toString("yyyyMMdd");

	QString path = QString("%1/%2").arg(m_filePath).arg(dateTime);
	QDir dir(path);
	if (!dir.exists())
		dir.mkdir(path);

	QFile file(QString("%1/data.csv").arg(path));
	if (file.open(QIODevice::Append | QIODevice::Text)) {
		QTextStream out(&file);

		if (isInitLog) {
			out << "[New Cycle]," << header << "\n";
			isInitLog = false;
		}

		out << currentTime << ",";
		out << dataToStr << ",";
		out << "\n";
	}
	//Logger::logger->debug("onNewValuesRand data parsing elapsed {}ms", timer.elapsed());


	// Emit WebSocket data
	if (!wsRegs.isEmpty()) {
		QJsonObject wsData;
		wsData["registers"] = wsRegs;
		emit newParsedRow(wsData);
	}

	m_receiving = true;
	
}

void CsvLog::startLog()
{
	addLog(QString("A new Thread for CSV saving has been generated.."));
}

void CsvLog::onStartInspection(const QString &device, int tabNo)
{
	QMutexLocker locker(&m_algoMutex);

	if (m_data.size() == 0)
		return;

	QString label = QString("LeakTrig(%1.0)").arg(device);
	auto keyExist = m_data.find(label);
	if (keyExist != m_data.end()) {

		//HZ
		double hertz = 0;
		const auto &protocol = g_tabs[tabNo].protocol;
		if (g_tabs[tabNo].protocol.type == ProtType::CCLink) {
			const CCLink_Info& cc = std::get<CCLink_Info>(protocol.info);

			hertz = cc.samplingRate;
		}
		
		//��ü �˻� �ð� EX)45.6 = 5.1(�������νð�) + 19.5(����ȭ�ð�) + 21(�˻�ð�)
		//���� ���� �ð� (���� ��ü������ �ο��ϴ� delay�� �߰��Ұ�)
		//����ȭ �ð� (���� ��ü������ �ο��ϴ� delay�� �߰��Ұ�)
		auto P2 = m_data.find(QString("P2_Idx_0"));
		auto leakVarExist_2 = m_data.find(QString("VacuumPump_0"));
		auto P1 = m_data.find(QString("P1_Idx_0"));

		double inspTime = 0, vacPump = 0, stabTime = 0;
		
		std::vector<std::string> jrIDs;

		if (P2 != m_data.end() &&
			leakVarExist_2 != m_data.end() &&
			P1 != m_data.end()) {

			vacPump = std::get<double>(m_data[QString("VacuumPump_0")][0]);
			

			for (int i = 0; i < m_data[QString("P2_Idx_0")].size(); ++i) {
				if (std::get<double>(m_data[QString("P2_Idx_0")][i]) > 0) {
					inspTime = i;
					break;
				}
			}

			for (int j = 0; j < m_data[QString("P1_Idx_0")].size(); ++j) {
				if (std::get<double> (m_data[QString("P1_Idx_0")][j]) > 0) {
					stabTime = j;
					break;
				}
			}
		}
		else {
			qDebug() << "Leak Algorithm Variables not Exist";
			return;
		} 
		
		std::vector<std::string> jrID;
		// ���е����͸� 2���� ���ͷ� ����
		std::vector<std::vector<double>> data;
		for (int i = 0; i < g_tabs[tabNo].addressRead.size(); ++i){
			//���� ������ ����
			auto vacChannel = m_data.find(QString("LeakChannel_%1_0").arg(i));
			if (vacChannel != m_data.end()) {
				QString channel = QString("LeakChannel_%1_0").arg(i);
				std::vector<double> rows;
				rows.reserve(m_data[channel].size());

				for (const auto &v : m_data[channel])
					rows.push_back(std::get<double>(v));

				data.push_back(std::move(rows));
			}
			//JR ID ����
			auto id = m_data.find(QString("JR_ID_%1").arg(i));
			if (id != m_data.end()) {
				QString jr = QString("JR_ID_%1").arg(i);
				jrID.push_back(std::get<std::string>(m_data[jr][0]));
			}
		}
		/********* Run Algorithm *********/
		//2���� ���ͷ� �Է�.
		VacuumLeak vaccumLeak(hertz, inspTime, vacPump, stabTime);
		//�Ķ���͸� �����Ϳ� �Է�
		vaccumLeak.process(data);
		//������ ���
		std::vector<VacuumLeak::public_result> res = vaccumLeak.get_result();

		m_data.clear();
		qDebug() << "m_data cleared";

		//csv Save
		QString dateTime = QDateTime::currentDateTime().toString("yyyyMMdd");

		QString path = QString("%1/%2").arg(m_filePath).arg(dateTime);
		QDir dir(path);
		if (!dir.exists())
			dir.mkdir(path);

		QFile file(QString("%1/Result.csv").arg(path));
		if (file.open(QIODevice::Append | QIODevice::Text)) {
			QTextStream out(&file);

			int num = 1;
			QString time = QDateTime::currentDateTime().toString("yyyyMMdd-hh:mm:ss.zzz");
			QString header = QString(",JR_ID, leak_idx, deltaP, r_2, P0, A, tau, B, \n");
			out << time << header;
			for (const auto & n : res) {
				out << QString("[Channel%1]").arg(num) << ",";
				if(num-1>=jrID.size())
					out <<  "None ,";
				else
					out << QString::fromStdString(jrID[num-1]) << ",";

				out << n.leak_idx << ",";
				out << n.deltap << ",";
				out << n.r2 << ",";
				out << n.P0 << ",";
				out << n.A << ",";
				out << n.tau << ",";
				out << n.B << ",";
				out << "\n";
				num++;
			}
			out << "\n";
		}
	}
	else
		qDebug() << "LeakTrig not Exist";

}