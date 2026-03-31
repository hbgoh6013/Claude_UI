#pragma once

#include <QObject>
#include <QJsonObject>
#include <QJsonArray>
#include <QTimer>
#include <QString>

#include <windows.h>

class SystemInfo : public QObject
{
    Q_OBJECT

public:
    explicit SystemInfo(QObject *parent = nullptr);
    ~SystemInfo();

    void start(int intervalMs = 2000);
    void stop();
    QJsonObject collect();

signals:
    void systemInfoReady(const QJsonObject &info);

private:
    QTimer *m_timer;

    // CPU usage calculation state (GetSystemTimes based)
    quint64 m_prevIdleTime;
    quint64 m_prevKernelTime;
    quint64 m_prevUserTime;
    bool m_initialized;

    double getCpuUsage();
    QString getCpuName();
    int getCpuCores();
    QJsonObject getMemoryInfo();
    QJsonArray getDiskInfo();
    QJsonObject getGpuInfo();
};
