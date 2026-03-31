#pragma once
#include <QtWidgets/QtWidgets>
#include <vector>
#include <utility>
#include <variant>

#include "PlcManager.h"
#include "Settings.h"
#include "Logger.h"


class PlcManager;
class Settings;

struct SystemSettings {
	bool csvSaveSplit;
	int plcCount;

	SystemSettings() {
		csvSaveSplit = false;
		plcCount = 1;
	}
};

struct PLC_Info {
	std::string deviceName;
	std::string ip;
	uint16_t port;
	//std::string protocol;
	int nSamples;

	PLC_Info() {
		deviceName = " ";
		ip = " ";
		port = 0;
		//protocol = " ";
		nSamples = 50;
	}

	enum Type {
		Random,
		Batch,

		TestMode1,
		TestMode2,
		TestMode3,
		TestMode4,
		TestMode5,

		None,

		Type_Count
	};
	Type type;

	static Type parseType(const QString &type) {
		if (type == "Random") return Type::Random;
		else if (type == "Batch") return Type::Batch;
		else if (type == "TestMode1") return Type::TestMode1;
		else if (type == "TestMode2") return Type::TestMode2;
		else if (type == "TestMode3") return Type::TestMode3;
		else if (type == "TestMode4") return Type::TestMode4;
		else if (type == "TestMode5") return Type::TestMode5;
		else return  Type::None;
	}
};

struct OPCUA_Info {
	int nameSpace;
	std::string objectRoot;

	OPCUA_Info() {
		nameSpace = 0;
		objectRoot = " ";
	}
};

struct CCLink_Info {
	long cChanID;                // CC-Link #1
	long cNetworkNo;                // NetworkNo
	long cOwnerStn;              // Read from owner station
	long cRemoteStn;             // Read from remote station
	SHORT RwSize;                 // Device Count
	double samplingRate;

	CCLink_Info() {
		cChanID = 81;
		cOwnerStn = 0xFF;
		cRemoteStn = 0x02;
		RwSize = 2;
		samplingRate = 1000;
	}
};

struct Rand_PLC_Trigger {
	int id;
	int bufIdx;
	int blockIdx;
	QString device;
	QString matchType;
	bool triggerMatch;

	Rand_PLC_Trigger() {
		id = -1123;
		bufIdx = 0;
		blockIdx = 0;
		device = " ";
		matchType = " ";
		triggerMatch = false;
	}
};

struct RandRAddrList {
	std::vector<long> lists;
	long bufSize;
	std::vector<Rand_PLC_Trigger> plcTrigger;
};

struct AddressList {
	QString label;
	QString device;
	long devType; //DevX, DevD, DevW ..
	//PlcDataType dataType; //Bit, Word, DoubleWord ..
	long deviceNo;
	int bitIndex;
	int count;
	//QString dataType;
	bool triggerMatch;
	int matchID;
	QString matchType;

	AddressList() {
		label = " ";
		device = 'M';
		devType = DevM;
		deviceNo = 0;
		bitIndex = 0;
		count = 1;
		//dataType = "Bit";
		triggerMatch = false;
		matchID = 0;
		matchType = "Slave";
	}

	enum DataType {
		Bit,
		Word,
		DoubleWord,
		Float,
		Double,
		String,
		None,

		DataType_Count
	};
	DataType dataType;

	static DataType parseDataType(const QString &type) {
		if (type == "Bit") return DataType::Bit;
		else if (type == "Word") return DataType::Word;
		else if (type == "DWord") return DataType::DoubleWord;
		else if (type == "Float") return DataType::Float;
		else if (type == "Double") return DataType::Double;
		else if (type == "String") return DataType::String;
		else return  DataType::None;
	}

	void parseDevType() {
		if (device == "M") { devType = DevX; }
		if (device == "Y") { devType = DevY; }
		if (device == "M") { devType = DevM; }

		if (device == "D") { devType = DevD; }
		if (device == "RW") { devType = DevW; }

		if (device == "B") { devType = DevB; }
		if (device == "W") { devType = DevW; }

		if (device == "LB") { devType = DevLB(deviceNo); }
		if (device == "LW") { devType = DevLW(deviceNo); }
	}
};

enum class ProtType {
	OPCUA,
	CCLink,
	MC,
	FINS,
	S7
};

using ProtVariant =
std::variant<
	PLC_Info,
	OPCUA_Info,
	CCLink_Info
>;

struct ProtInfo {
	ProtType type;
	ProtVariant info;
};
struct Tabs {
	PLC_Info plc;
	ProtInfo protocol;
	QVector<AddressList> addressRead;
	QVector<AddressList> addressWrite;
	RandRAddrList randRAddr;
};

extern Settings *g_settings;
extern QWidget *g_mainWindow;
extern QVector<PlcManager*> g_plcManager;
extern PLC_Info g_plcs;
extern CCLink_Info g_ccInfo;
extern OPCUA_Info g_opcInfo;
extern SystemSettings g_systemSettings;
extern QString g_baseDir;
extern QString g_logDir;
extern QVector<AddressList> g_addressList;
extern QVector<AddressList> g_addressListW;
void addLog(const QString &text);

extern QVector<Tabs> g_tabs;