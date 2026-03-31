#include "CCLink.h"
#include <algorithm>
//mdOpen → mdReceive → mdSend → mdClose 기본 흐름

CCLink::CCLink()
{
	isConnect = false;
	m_run = true;

	cChanID = g_ccInfo.cChanID;               // CC-Link #1
	cNetworkNo = g_ccInfo.cNetworkNo;
	cOwnerStn = g_ccInfo.cOwnerStn;           // Read from owner station
	cRemoteStn = g_ccInfo.cRemoteStn;          // Read from remote station
	RwSize = g_ccInfo.RwSize;                 // Device count

	m_period = (1. / g_ccInfo.samplingRate) * 1000;
	m_lastPollTime = 0;

	m_filePath = g_baseDir + "/ResultLog";
	m_elapsed.start();

	m_testingCnt = 0;

}

CCLink::~CCLink()
{
	long ret = mdClose(m_handler);

	if (ret != 0)
		errCode(ret);
	else
		addLog(QString("PLC%1 closed..").arg(m_tabNo + 1));
}

bool CCLink::nConnect() {
	short ret;

	QElapsedTimer t;
	t.start();

	ret = mdOpen(cChanID, -1, &m_handler);

	if (ret != 0) {
		addLog(QString("Unable to Connect PLC.. [mdOpen Error:%1]").arg(ret));
		errCode(ret);
		isConnect = false;
		return isConnect;
	}

	//spdlog::debug("CC Link Channel Connected {}ms", t.elapsed());
	addLog(QString("PLC%1 Successfully Connected..").arg(m_tabNo+1));
	isConnect = true;
	return isConnect;
}

bool CCLink::isConnected() {
	return isConnect;
}


void CCLink::nRead()
{
	QMutexLocker locker(&m_mutex);

	if (m_elapsed.elapsed() - m_lastPollTime >= m_period) {
		if (m_lastPollTime == 0)
			m_lastPollTime = m_elapsed.elapsed();
		else
			m_lastPollTime += m_period;

		//Logger::logger->debug("------------------------------------");
		QElapsedTimer totalDataElapse;
		totalDataElapse.start();

		QString dt = QDateTime::currentDateTime().toString("yyyyMMdd-hh:mm:ss.zzz");
		int vecCnt = 0;

		switch (g_tabs[m_tabNo].plc.type) {
		case PLC_Info::Batch:
		{
			for (const AddressList& addr : g_tabs[m_tabNo].addressRead)
			{
				QElapsedTimer singleDataElapse;
				QString csvHeader;
				bool pass = false;

				// Slave Trigger 매치가 체크되고 해당 어드레스 매치 타입이 Slave라면
				if (addr.triggerMatch && addr.matchType == "Slave") {
					// 해당 Master Trigger의 ID를 찾아서
					for (const auto &key : m_triggerStatus)
						// Master Trigger ID와 Slave Trigger ID와 다르거나 Master Trigger 상태가 false라면
						if (key.first != addr.matchID || !key.second)
							pass = true; // 데이터 취득 X PASS
				}

				if (pass) {
					vecCnt++;
					continue;
				}

				long deviceNo = addr.deviceNo;
				long deviceType = addr.devType;
				long bufSize = addr.count;

				switch (addr.dataType) {
				case AddressList::Bit:
				{
					if (addr.devType == DevM || addr.devType == DevX || addr.devType == DevY || addr.devType == DevB) {
						int cnt = addr.count;
						if ((cnt % 16) > 0)
							bufSize = cnt / 16 + 1;
						else
							bufSize = cnt / 16;
					}
					break;
				}
				case AddressList::Word: break;
				case AddressList::String: break;
				case AddressList::DoubleWord: bufSize = 2 * addr.count; break;
				case AddressList::Float: bufSize = 2 * addr.count; break;
				case AddressList::Double: bufSize = 4 * addr.count; break;
				}

				std::vector<short> dataBuf(bufSize);
				if (deviceNo < 0) {
					short err = mdClose(m_handler);
					if (err != 0)
						addLog(QString("Device No shouldn't be less than 0, [ret = %1]").arg(err));
					
				}

				long size = bufSize * 2;
				singleDataElapse.start();
				long ret = mdReceiveEx(m_handler, cNetworkNo, cRemoteStn, deviceType, deviceNo, &size, dataBuf.data());
				std::string devices = QString("%1%2").arg(addr.device).arg(addr.deviceNo).toStdString();
				//
				dataBuf[0] = 1;
				dataBuf[1] = 1; // Bit

				if (m_testingCnt >= 100)
					dataBuf[0] = 1; // Word Bit

				if (m_testingCnt >= 200)
					dataBuf[0] = 0; // Word Bit

				if (m_testingCnt >= 300)
					dataBuf[0] = 1; // Word Bit

				if (m_testingCnt >= 400)
					dataBuf[0] = 0; // Word Bit

				m_testingCnt++;

				addLog(QString("testing Count : %1 and value : %2").arg(m_testingCnt).arg(dataBuf[0]));
				ret = 0;
				//

				//if (addr.count > 1)
				//	Logger::logger->debug(" {}*{} mdReceiveEx time elpased {}ms", devices, addr.count, singleDataElapse.elapsed());
				//else
				//	Logger::logger->debug(" {} mdReceiveEx time elpased {}ms", devices, singleDataElapse.elapsed());

				if (ret != 0) {
					addLog(QString("data recieving Error : %1%2 [Err Code = %3]").arg(addr.device).arg(addr.deviceNo).arg(ret));
					errCode(ret);
					continue;
				}

				emit newValuesBatch(dataBuf, m_tabNo, bufSize, vecCnt, dt);
				vecCnt++;

				if (addr.triggerMatch && addr.matchType == "Master")
					getRstTargets(dataBuf, addr.matchID);
			}
			break;

			//Logger::logger->debug("mdReceiveEx + Queued time elapsed {}ms", totalDataElapse.elapsed());
			//Logger::logger->debug("------------------------------------");

		}
		case PLC_Info::Random:
		{
			//QElapsedTimer randReadElapse;
			int blocks = g_tabs[m_tabNo].randRAddr.lists[0];

			std::vector<long> devList = g_tabs[m_tabNo].randRAddr.lists;
			long bufSize = g_tabs[m_tabNo].randRAddr.bufSize;

			std::vector<short> dataBuf(bufSize);
			std::vector<int> trigBufIdx;

			/* If only using Trigger Match!! */
			//if Master plc bits exist
			if (m_triggerStatus.size() != 0) {
				for (const auto & isTrigOn : g_tabs[m_tabNo].randRAddr.plcTrigger)
				{
					if (isTrigOn.triggerMatch) {
						if (isTrigOn.matchType == "Master") {
							auto index = m_triggerStatus.find(isTrigOn.id);
							if (index != m_triggerStatus.end())
								trigBufIdx.push_back(isTrigOn.bufIdx);
						}
					}
				}
			}

			QString dt = QDateTime::currentDateTime().toString("yyyyMMdd-hh:mm:ss.zzz");
			//randReadElapse.start();
			long ret = mdRandREx(m_handler, cNetworkNo, cRemoteStn, devList.data(), dataBuf.data(), bufSize * 2);
			//Logger::logger->debug("[{} blocks] mdRandREx time elpased {}ms", blocks, randReadElapse.elapsed());


			//
			dataBuf[0] = -673;
			dataBuf[1] = -873; 
			dataBuf[2] = -743; 
			dataBuf[3] = -583; 
			dataBuf[4] = -723; // LeakChannels

			dataBuf[5] = 1; // LeakTrigger

			dataBuf[6] = 0; // Stabilization Time (P1)
			dataBuf[7] = 0; // Inspection Time (P2)
			dataBuf[8] = 5; // Vacuum Pump

			dataBuf[9] = 71; 
			dataBuf[10] = 73; 
			dataBuf[11] = 69; 
			dataBuf[12] = 75; 
			dataBuf[13] = 83; 
			dataBuf[14] = 48; 
			dataBuf[15] = 48; 
			dataBuf[16] = 48; 
			dataBuf[17] = 48; 
			dataBuf[18] = 48; 
			dataBuf[19] = 48; 
			dataBuf[20] = 49; //JR ID


			if (m_testingCnt <= 30)
				dataBuf[5] = 0;

			if (m_testingCnt >= 365) {
				m_testingCnt = 0;
			}
				

			if (m_testingCnt >= 150 )
				dataBuf[6] = 100;

			if (m_testingCnt >= 330)
				dataBuf[7] = 100;

			if (m_testingCnt >= 350) {
				dataBuf[6] = 0;
				dataBuf[7] = 0;
			}
				
			m_testingCnt++;

			addLog(QString("testing Count : %1 and value : %2").arg(m_testingCnt).arg(dataBuf[5]));
			ret = 0;
			


			if (ret != 0) {
				addLog(QString("Random data recieving Error [ret = %1]").arg(ret));
				errCode(ret);
				break;
			}

			std::vector<int> ids;
			if (m_triggerStatus.size() != 0)
				getRstTargetsR(dataBuf, trigBufIdx, ids);

			emit newValuesRand(dataBuf, m_tabNo, bufSize, dt, ids);

			break;
		}
		case PLC_Info::None:
		{
			Logger::logger->debug("No received Data", totalDataElapse.elapsed());
			break;
		}
		}

		//Logger::logger->debug("mdRandREx + Queued time elapsed {}ms", totalDataElapse.elapsed());
		//Logger::logger->debug("------------------------------------");
	}
}
void CCLink::nWrite()
{

}

void CCLink::nLoad()
{

}

void CCLink::nStart() {
	if (isConnect) {
		addLog(QString("PLC%1 Data Acq Started.. polling Timer Set: %2ms ").arg(m_tabNo + 1).arg(m_period));
		qDebug() << "nStart Pressed";

		setMatchTrigger();
		QElapsedTimer cycleTimer;
		while (m_run) {
			//Logger::logger->debug("nRead polling elapsed {}ms", cycleTimer.elapsed());
			nRead();
			QThread::yieldCurrentThread();
			//cycleTimer.restart();
		}
	}
	else {
		addLog(QString("PLC%1 has no Connections ").arg(m_tabNo+1));
		/*** 테스트용 ... 삭제 필요 ***/
		addLog(QString("PLC%1 Data Acq Started.. polling Timer Set: %2ms ").arg(m_tabNo+1).arg(m_period));
		qDebug() << "nStart Pressed";

		setMatchTrigger();
		QElapsedTimer cycleTimer;
		while (m_run) {
			//Logger::logger->debug("nRead polling elapsed {}ms", cycleTimer.elapsed());
			nRead();
			QThread::yieldCurrentThread();
			//cycleTimer.restart();
		}
	}
}
void CCLink::nStop() {
	addLog(QString("PLC%1 Data Acq Stopped ").arg(m_tabNo+1));
	qDebug() << "nStop Pressed";
	m_run = false;
	emit finished();
}

void CCLink::nAddress(int tabNo)
{
	m_tabNo = tabNo;
}


void CCLink::setMatchTrigger()
{
	for (const AddressList& addr : g_tabs[m_tabNo].addressRead) {
		// Bit 영역만 Master Bit로 설정 가능
		if (addr.dataType != AddressList::Bit)
			continue;

		if (addr.triggerMatch && addr.matchType == "Master") {
			addLog(QString("PLC%1 contains Master Trigger: %2 / ID: %3  ")
				.arg(m_tabNo+1)
				.arg(QString("%1%2").arg(addr.device).arg(addr.deviceNo))
				.arg(addr.matchID));

			m_triggerStatus.insert({ addr.matchID, false });
		}
	}
}


void CCLink::getRstTargets(const std::vector<short> &data, int id)
{
	if (data.size() == 0)
		return;

	if (data[0] & 1) {
		auto index = m_triggerStatus.find(id);
		if (index != m_triggerStatus.end())
			index->second = true;
	}
	else {
		auto index = m_triggerStatus.find(id);
		if (index != m_triggerStatus.end())
			index->second = false;
	}
}

void CCLink::getRstTargetsR(const std::vector<short> &data,
	const std::vector<int> &bufIdx,
	std::vector<int> &ids)
{
	if (data.size() == 0)
		return;

	for (const auto &trig : g_tabs[m_tabNo].randRAddr.plcTrigger) {
		if (trig.triggerMatch && trig.matchType == "Master") {
			int id = trig.id;
			int bufIndex = trig.bufIdx;

			auto index = m_triggerStatus.find(id);
			if (index != m_triggerStatus.end()) {
				for (const auto &idx : bufIdx) {
					if (idx == bufIndex) {
						if (data[idx] & 1)
							index->second = true;
						else {
							index->second = false;
							ids.push_back(id);
						}
					}

				}
			}
		}
	}
}

void CCLink::errCode(long ret)
{
	if (ret == -2)
		Logger::logger->debug(" Err Code: {} Check the start device number", ret);
	else if (ret == -8)
		Logger::logger->debug(" Err Code: {} Check the number of blocks", ret);
	else if(ret == -16 || -17)
		Logger::logger->debug(" Err Code: {} Check the network number and the station number", ret);
	else if (ret == -18)
		Logger::logger->debug(" Err Code: {} Check the command code", ret);
	else if (ret == -19 || ret == -8)
		Logger::logger->debug(" Err Code: {} Check the channel number", ret);
}