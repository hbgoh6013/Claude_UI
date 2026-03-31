#include "PlcManager.h"
#include "WebSocketServer.h"

PlcManager::PlcManager(QObject *parent/* = nullptr*/) : QObject(parent)
{
	m_thread = nullptr;
	m_threadProt = nullptr;
	m_csv = nullptr;
	m_csvThread = nullptr;
	m_leakAlgo = nullptr;
	m_wsServer = nullptr;
}
PlcManager::~PlcManager()
{
}

void PlcManager::init()
{
	//PlcManager 객체 프로토콜 소유권 정하기
	m_threadProt = new CCLink;

	m_thread = new QThread;
	m_csvThread = new QThread;
	m_csv = new CsvLog;

	//start Threads
	connect(m_thread, &QThread::started, m_threadProt, &IPlcProtocol::nConnect);
	connect(m_csvThread, &QThread::started, m_csv, &CsvLog::startLog);

	connect(m_thread, &QThread::started, m_threadProt, [this]() {
		m_threadProt->nAddress(m_tabNo);
		QString tag = QString("[%1][tid=%2]")
			.arg(QThread::currentThread()->objectName())
			.arg(reinterpret_cast<quintptr>(QThread::currentThreadId()));
	});

	connect(m_thread, &QThread::finished, m_threadProt, [this]() {
		QString tag = QString("[%1][tid=%2]")
			.arg(QThread::currentThread()->objectName())
			.arg(reinterpret_cast<quintptr>(QThread::currentThreadId()));
	});

	// quit Threads
	connect(m_threadProt, &IPlcProtocol::finished, m_thread, &QThread::quit);
	connect(m_threadProt, &IPlcProtocol::finished, m_csvThread, &QThread::quit);

	// clean memories
	connect(m_thread, &QThread::finished, m_threadProt, &QObject::deleteLater);
	connect(m_thread, &QThread::finished, m_thread, &QObject::deleteLater);
	connect(m_thread, &QThread::finished, this, [&] {emit finished(); });
	connect(m_csvThread, &QThread::finished, m_csv, &QObject::deleteLater);
	connect(m_csvThread, &QThread::finished, m_csvThread, &QObject::deleteLater);

	// new Data Values occured send data to Csv Thread
	connect(m_threadProt, &IPlcProtocol::newValuesBatch, m_csv, &CsvLog::onNewValuesBatch, Qt::QueuedConnection);
	connect(m_threadProt, &IPlcProtocol::newValuesRand, m_csv, &CsvLog::onNewValuesRand, Qt::QueuedConnection);

	// Forward parsed rows to WebSocket if server is set
	if (m_wsServer) {
		connect(m_csv, &CsvLog::newParsedRow,
				m_wsServer, &WebSocketServer::sendData,
				Qt::QueuedConnection);
	}

	m_threadProt->moveToThread(m_thread);
	m_thread->start();

	m_csv->moveToThread(m_csvThread);
	m_csvThread->start();
}

bool PlcManager::checkConnection()
{
	if (!m_threadProt) {
		// 프로토콜이 초기화되지 않음 → 연결 상태를 알 수 없음
		addLog("[PlcManager] checkConnection called before protocol init");
		return false;
	}
	return m_threadProt->isConnected();
}

void PlcManager::startRecv()
{
	if (m_thread && m_thread->isRunning()) {
		addLog("It is running.. Press 'Stop' button");
		return;
	}
	init();
	if (m_threadProt)
		QMetaObject::invokeMethod(m_threadProt, "nStart", Qt::QueuedConnection);
}

void PlcManager::stopRecv()
{
	if (!m_threadProt) {
		addLog("[PlcManager] stopRecv ignored – protocol not initialized");
		return;
	}
	else {
		if (m_thread && m_thread->isRunning()) {
			QMetaObject::invokeMethod(m_threadProt, "nStop", Qt::DirectConnection);
		}
		else
			addLog("not started");
	}
}

void PlcManager::loadData()
{
	if (!m_threadProt) {
		addLog("[PlcManager] loadData ignored – protocol not initialized");
		return;
	}
	m_threadProt->nLoad();
}

void PlcManager::parseDevice()
{
	for (int i = 0; i < g_addressList.size(); i++)
	{
		if (g_addressList[i].device == "X") {g_addressList[i].devType = DevX; }
		if (g_addressList[i].device == "Y") {g_addressList[i].devType = DevY; }
		if (g_addressList[i].device == "M") { g_addressList[i].devType = DevM; }

		if (g_addressList[i].device == "D") { g_addressList[i].devType = DevD; }
		if (g_addressList[i].device == "RW") { g_addressList[i].devType = DevW; }

		if (g_addressList[i].device == "B") { g_addressList[i].devType = DevB; }
		if (g_addressList[i].device == "W") { g_addressList[i].devType = DevW; }

		if (g_addressList[i].device == "LB") { g_addressList[i].devType = DevLB(g_addressList[i].deviceNo); };
		if (g_addressList[i].device == "LW") { g_addressList[i].devType = DevLW(g_addressList[i].deviceNo); };
		
	}

}

void PlcManager::currentTab(int tabNo)
{
	m_tabNo = tabNo;

}