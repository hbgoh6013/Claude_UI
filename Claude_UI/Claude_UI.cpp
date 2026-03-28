#include "Claude_UI.h"

#include <QJsonObject>
#include <QJsonArray>
#include <QDebug>

// Qt 5.10+ / Qt 6.x 모두 QRandomGenerator 사용 가능
#include <QRandomGenerator>

Claude_UI::Claude_UI(QWidget *parent)
    : QMainWindow(parent)
{
    ui.setupUi(this);

    // ─── WebSocket 서버 시작 (포트 8080) ───
    m_wsServer = new WebSocketServer(8080, this);

    if (m_wsServer->start()) {
        qDebug() << "WebSocket server started successfully";
    }

    // 연결/해제 로그
    connect(m_wsServer, &WebSocketServer::clientConnected,
            this, [](const QString &addr) {
        qDebug() << "Web UI connected from:" << addr;
    });

    connect(m_wsServer, &WebSocketServer::clientDisconnected,
            this, [](const QString &addr) {
        qDebug() << "Web UI disconnected:" << addr;
    });

    // ─── 1초마다 데이터 전송 타이머 ───
    m_dataTimer = new QTimer(this);
    connect(m_dataTimer, &QTimer::timeout, this, &Claude_UI::sendPlcData);
    m_dataTimer->start(1000);  // 1000ms = 1초
}

Claude_UI::~Claude_UI()
{
}

void Claude_UI::sendPlcData()
{
    // 연결된 클라이언트가 없으면 전송 불필요
    if (m_wsServer->clientCount() == 0) {
        return;
    }

    // ═══════════════════════════════════════════════════
    //  TODO: 아래 시뮬레이션 데이터를 실제 PLC 데이터로 교체
    //
    //  예시:
    //    double temp = plcReader->readD(0);  // D0 레지스터
    //    double pres = plcReader->readD(10); // D10 레지스터
    //    int speed   = plcReader->readD(20); // D20 레지스터
    // ═══════════════════════════════════════════════════

    QRandomGenerator *rng = QRandomGenerator::global();

    // 메인 지표
    double temperature = 22.0 + rng->bounded(80) / 10.0;   // 22.0 ~ 30.0
    double pressure    = 0.80 + rng->bounded(60) / 100.0;   // 0.80 ~ 1.40
    int motorSpeed     = 1200 + rng->bounded(600);           // 1200 ~ 1800
    int productCount   = rng->bounded(10000);                // 0 ~ 9999

    // CC-Link IE 스테이션 디바이스 목록
    QJsonArray devices;
    struct DeviceInfo {
        int station;
        const char *name;
        const char *type;
    };

    DeviceInfo deviceList[] = {
        { 1, "Conveyor #1",  "Remote I/O" },
        { 2, "Robot Arm A",  "Remote Device" },
        { 3, "Sensor Unit",  "Remote I/O" },
        { 4, "Inverter #1",  "Remote Device" },
        { 5, "Conveyor #2",  "Remote I/O" },
    };

    for (const auto &dev : deviceList) {
        QString status = "RUN";
        int chance = rng->bounded(100);
        if (chance > 95)      status = "STOP";
        else if (chance > 90) status = "ERR";

        QJsonObject deviceObj;
        deviceObj["station"] = dev.station;
        deviceObj["name"]    = QString(dev.name);
        deviceObj["type"]    = QString(dev.type);
        deviceObj["status"]  = status;
        deviceObj["value"]   = rng->bounded(100);
        devices.append(deviceObj);
    }

    // D 레지스터 (D0 ~ D150, 16개)
    QJsonArray registers;
    for (int i = 0; i < 16; ++i) {
        QJsonObject reg;
        reg["addr"]  = QString("D%1").arg(i * 10);
        reg["value"] = rng->bounded(65536);  // 0 ~ 65535
        registers.append(reg);
    }

    // JSON 조립
    QJsonObject data;
    // temperature, pressure는 문자열로 전송 (소수점 자릿수 고정)
    data["temperature"]  = QString::number(temperature, 'f', 1);
    data["pressure"]     = QString::number(pressure, 'f', 2);
    data["motorSpeed"]   = motorSpeed;
    data["productCount"] = productCount;
    data["devices"]      = devices;
    data["registers"]    = registers;

    // 전송
    m_wsServer->sendData(data);
}
