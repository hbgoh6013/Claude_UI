#include "Settings.h"

Settings::Settings()
{
	m_path = g_baseDir + "/plc_config.json";
}

Settings::~Settings()
{

}

void Settings::load()
{
	
	QFile file(m_path);
	if (!file.open(QIODevice::ReadOnly)) {
		qWarning() << "Cannot open file:" << m_path;
		addLog(QString("Cannot open file: %1").arg(m_path));
		return;
	}

	QByteArray data = file.readAll();
	QJsonParseError err;
	QJsonDocument doc = QJsonDocument::fromJson(data, &err);
	if (err.error != QJsonParseError::NoError) {
		qWarning() << "JSON error:" << err.errorString()
			<< "at offset" << err.offset;
		addLog(QString("JSON parse error: %1 at offset %2").arg(err.errorString()).arg(err.offset));
		return;
	}

	QJsonObject root = doc.object();

	// System Settings
	QString strS = root["CsvSplit"].toString();
	bool split = (strS == "True") ? true : false;
	g_systemSettings.csvSaveSplit = split;

	int plcCount = root["PlcCount"].toInt();
	g_systemSettings.plcCount = plcCount;

	g_tabs.resize(plcCount);

	for (int i = 1; i <= plcCount; i++)
	{
		// PLC Info
		QJsonObject plcObj = root[QString("PLC%1").arg(i)].toObject();
		QString ip = plcObj["IP"].toString();
		g_plcs.ip = ip.toStdString();
		uint16_t port = plcObj["Port"].toInt();
		g_plcs.port = port;
		int nSamples = plcObj["NSamples"].toInt();
		g_plcs.nSamples = nSamples;
		QString protocol = plcObj["Protocol"].toString();
		//g_plcs.protocol = protocol.toStdString();

		QJsonObject protocols = plcObj["Protocols"].toObject();
		if (protocol.contains("CCLINKIE")) {
			// ------------------------------------
			// CC LINK IE
			// ------------------------------------
			QJsonObject cclinkie = protocols["CCLINKIE"].toObject();
			long ChannelID = cclinkie["ChannelID"].toInt();
			g_ccInfo.cChanID = ChannelID;
			long networkNo = cclinkie["NetworkNo"].toInt();
			g_ccInfo.cNetworkNo = networkNo;
			long ownerStation = cclinkie["OwnerStation"].toInt();
			g_ccInfo.cOwnerStn = ownerStation;
			long remoteStation = cclinkie["RemoteStation"].toInt();
			g_ccInfo.cRemoteStn = remoteStation;

			double samplingRate = cclinkie["SamplingRate"].toDouble();
			g_ccInfo.samplingRate = samplingRate;

			QString type = cclinkie["Type"].toString();
			g_plcs.type = g_plcs.parseType(type);
			QString deviceName = cclinkie["DeviceName"].toString();
			g_plcs.deviceName = deviceName.toStdString();

			addLog(QString("*-------------------------*"));
			addLog(QString("PLC%1 - Device Name: %2").arg(i).arg(deviceName));
			addLog(QString("[CC LINK IE Controller]"));
			addLog(QString("ChannelID = %1").arg(ChannelID));
			addLog(QString("NetworkNo = %1").arg(networkNo));
			addLog(QString("OwnerStation = %1").arg(ownerStation));
			addLog(QString("RemoteStation = %1").arg(remoteStation));
			addLog(QString("samplingRate = %1Hz").arg(samplingRate));
			addLog(QString("*-------------------------*"));

			// Addresses �迭
			if (!g_addressList.isEmpty() || !g_addressListW.isEmpty()) {
				g_addressList.clear();
				g_addressListW.clear();
			}

			QJsonObject addresses = cclinkie["Addresses"].toObject();
			QJsonArray readAddr = addresses["Read"].toArray();

			if (g_plcs.type == PLC_Info::Random || g_plcs.type == PLC_Info::TestMode2) {
				std::vector<long> addrList;
				// Number of Blocks
				addrList.push_back(readAddr.size());
				long bufSize = 0;
				int idx = 0;
				int blockIdx = 0;
				// Blocks
				for (const QJsonValue& v : readAddr) {
					QJsonObject addr = v.toObject();
					

					AddressList randLists;
					randLists.device = addr["device"].toString();
					randLists.deviceNo = addr["Number"].toInt();
					randLists.parseDevType();
					randLists.dataType = randLists.parseDataType(addr["dataType"].toString());
					randLists.matchID = addr["MatchID"].toInt();

					addrList.push_back(randLists.devType);
					addrList.push_back(addr["Number"].toDouble());
					long cnt = addr["count"].toInt();
					//if(cnt > )
					addrList.push_back(cnt);

					if (randLists.devType == DevM || randLists.devType == DevX || randLists.devType == DevY || randLists.devType == DevB) {
						if ((cnt % 16) > 0)
							bufSize = cnt / 16 + 1;
						else
							bufSize = cnt / 16;
					}
					else if (randLists.devType == DevD || randLists.devType == DevW) {
						switch (randLists.dataType) {
						case AddressList::Bit: bufSize = 1; break;
						case AddressList::Word: bufSize = cnt; break;
						case AddressList::String: bufSize = cnt; break;
						case AddressList::DoubleWord: bufSize = cnt * 2; break;
						case AddressList::Float: bufSize = cnt * 2; break;
						case AddressList::Double: bufSize = cnt * 4; break;
						}
					}
					//Rand Read �׸� �� Trigger Bit ����
					QString matchType = addr["MatchType"].toString();
					bool trigMatch = (addr["TriggerMatch"].toString() == "True") ? true : false;

					Rand_PLC_Trigger m;
					m.id = randLists.matchID;
					m.bufIdx = g_tabs[i - 1].randRAddr.bufSize;
					m.blockIdx = blockIdx;
					m.device = QString("%1%2").arg(randLists.device).arg(randLists.deviceNo);
					m.matchType = matchType;
					m.triggerMatch = trigMatch;

					blockIdx++;
					g_tabs[i - 1].randRAddr.plcTrigger.push_back(m);
					g_tabs[i - 1].randRAddr.bufSize += bufSize;
				}
				g_tabs[i - 1].randRAddr.lists = addrList;
			}

			addLog(QString("[Read Section]"));
			for (const QJsonValue& v : readAddr) {
				QString type = cclinkie["Type"].toString();
				QString deviceName = cclinkie["DeviceName"].toString();

				QJsonObject addr = v.toObject();
				QString device = addr["device"].toString();
				long addrNo = addr["Number"].toDouble();
				int bitIndex = addr["bitIdx"].toInt();
				int count = addr["count"].toInt();
				QString dataType = addr["dataType"].toString();
				QString label = addr["Label"].toString();

				bool trigMatch = (addr["TriggerMatch"].toString() == "True") ? true : false;
				int matchID = addr["MatchID"].toInt();
				QString matchType = addr["MatchType"].toString();

				AddressList tmp;
				tmp.device = device;
				tmp.deviceNo = addrNo;
				tmp.dataType = tmp.parseDataType(dataType);
				tmp.parseDevType();
				tmp.bitIndex = bitIndex;
				tmp.count = count;
				tmp.label = label;

				tmp.triggerMatch = trigMatch;
				tmp.matchID = matchID;
				tmp.matchType = matchType;
				
				g_addressList.push_back(tmp);

				addLog(QString("Address: %1%2 , ItemCount: %3 , DataType: %4 , Type: %5")
					.arg(device)
					.arg(addrNo)
					.arg(count)
					.arg(dataType)
					.arg(type));
			}

			QJsonArray writeAddr = addresses["Write"].toArray();
			addLog(QString("[Write Section]"));
			for (const QJsonValue& w : writeAddr) {

				QJsonObject addr = w.toObject();
				QString device = addr["device"].toString();
				long addrNo = addr["Number"].toDouble();
				int bitIndex = addr["bitIdx"].toInt();
				int count = addr["count"].toInt();
				QString dataType = addr["dataType"].toString();
				QString label = addr["Label"].toString();
				bool trigMatch = (addr["TriggerMatch"].toString() == "True") ? true : false;
				int matchID = addr["MatchID"].toInt();
				QString matchType = addr["MatchType"].toString();

				AddressList tmp;
				tmp.device = device;
				tmp.deviceNo = addrNo;
				tmp.dataType = tmp.parseDataType(dataType);
				tmp.parseDevType();
				tmp.bitIndex = bitIndex;
				tmp.count = count;
				tmp.label = label;
				tmp.triggerMatch = trigMatch;
				tmp.matchID = matchID;
				tmp.matchType = matchType;
				
				g_addressListW.push_back(tmp);

				addLog(QString("Address: %1%2 , ItemCount: %3 , DataType: %4 , Type: %5")
					.arg(device)
					.arg(addrNo)
					.arg(count)
					.arg(dataType)
					.arg(type));
			}
			g_tabs[i - 1].protocol = { ProtType::CCLink, g_ccInfo };
		}
		if (protocol.contains("OPCUA")) {
			// ------------------------------------
			// OPCUA
			// ------------------------------------
			QJsonObject opcua = protocols["OPCUA"].toObject();

			QString endpoint = opcua["endpoint"].toString();
			int ns = opcua["namespace"].toInt();

			qDebug() << "[OPCUA]";
			qDebug() << "endpoint =" << endpoint;
			qDebug() << "namespace =" << ns;
			g_tabs[i - 1].protocol = { ProtType::OPCUA, g_opcInfo };
		}

		g_tabs[i - 1].plc = g_plcs;
		g_tabs[i - 1].addressRead = g_addressList;
		g_tabs[i - 1].addressWrite = g_addressListW;
	}
}

void Settings::save()
{
    // Saving is performed via updateReadAddresses()
}

void Settings::updateReadAddresses(const QJsonArray &addresses)
{
    QFile file(m_path);
    if (!file.open(QIODevice::ReadOnly)) {
        qWarning() << "Cannot open config for update:" << m_path;
        return;
    }
    QJsonDocument doc = QJsonDocument::fromJson(file.readAll());
    file.close();
    if (!doc.isObject()) return;

    QJsonObject root = doc.object();
    QJsonObject plc1 = root["PLC1"].toObject();
    QJsonObject protocols = plc1["Protocols"].toObject();
    QJsonObject cclinkie = protocols["CCLINKIE"].toObject();
    QJsonObject addrObj = cclinkie["Addresses"].toObject();

    // Build lookup from existing entries to preserve trigger/match settings
    QJsonArray existingRead = addrObj["Read"].toArray();
    QMap<QString, QJsonObject> existingMap;
    for (const QJsonValue &v : existingRead) {
        QJsonObject o = v.toObject();
        QString key = o["device"].toString() + QString::number(o["Number"].toInt());
        existingMap[key] = o;
    }

    // Convert React format {label,device,address,count,dataType} to plc_config.json format
    QJsonArray newRead;
    for (const QJsonValue &v : addresses) {
        QJsonObject src = v.toObject();
        QString device = src["device"].toString();
        int number = src["address"].toInt();
        QString key = device + QString::number(number);

        QJsonObject entry;
        if (existingMap.contains(key)) {
            entry = existingMap[key];  // preserve TriggerMatch, MatchID, MatchType, bitIdx
        } else {
            entry["TriggerMatch"] = "False";
            entry["MatchID"]      = 1;
            entry["MatchType"]    = "Slave";
            entry["bitIdx"]       = 0;
        }
        entry["Label"]    = src["label"].toString();
        entry["device"]   = device;
        entry["Number"]   = number;
        entry["count"]    = src["count"].toInt();
        entry["dataType"] = src["dataType"].toString();
        newRead.append(entry);
    }

    addrObj["Read"] = newRead;
    cclinkie["Addresses"] = addrObj;
    protocols["CCLINKIE"] = cclinkie;
    plc1["Protocols"] = protocols;
    root["PLC1"] = plc1;

    if (!file.open(QIODevice::WriteOnly | QIODevice::Truncate)) {
        qWarning() << "Cannot write config file:" << m_path;
        return;
    }
    file.write(QJsonDocument(root).toJson(QJsonDocument::Indented));
    addLog(QString("plc_config.json updated (%1 addresses)").arg(newRead.size()));
}