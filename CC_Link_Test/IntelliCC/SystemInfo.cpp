#include "SystemInfo.h"

#include <QJsonDocument>
#include <QSettings>
#include <QStorageInfo>

// Windows headers (windows.h already included via header)

static quint64 filetimeToUint64(const FILETIME &ft)
{
    return (static_cast<quint64>(ft.dwHighDateTime) << 32) | ft.dwLowDateTime;
}

SystemInfo::SystemInfo(QObject *parent)
    : QObject(parent)
    , m_timer(new QTimer(this))
    , m_prevIdleTime(0)
    , m_prevKernelTime(0)
    , m_prevUserTime(0)
    , m_initialized(false)
{
    connect(m_timer, &QTimer::timeout, this, [this]() {
        QJsonObject info = collect();
        emit systemInfoReady(info);
    });

    // Take an initial reading so the first real sample has a delta
    FILETIME idleTime, kernelTime, userTime;
    if (GetSystemTimes(&idleTime, &kernelTime, &userTime)) {
        m_prevIdleTime   = filetimeToUint64(idleTime);
        m_prevKernelTime = filetimeToUint64(kernelTime);
        m_prevUserTime   = filetimeToUint64(userTime);
        m_initialized = true;
    }
}

SystemInfo::~SystemInfo()
{
    stop();
}

void SystemInfo::start(int intervalMs)
{
    m_timer->start(intervalMs);
}

void SystemInfo::stop()
{
    m_timer->stop();
}

QJsonObject SystemInfo::collect()
{
    QJsonObject root;
    root["type"] = QStringLiteral("system_info");

    // CPU
    QJsonObject cpu;
    cpu["usage"] = getCpuUsage();
    cpu["cores"] = getCpuCores();
    cpu["name"]  = getCpuName();
    root["cpu"]  = cpu;

    // Memory
    root["memory"] = getMemoryInfo();

    // Disks
    root["disks"] = getDiskInfo();

    // GPU (best-effort)
    root["gpu"] = getGpuInfo();

    return root;
}

// ---------------------------------------------------------------------------
// CPU usage via GetSystemTimes (no PDH dependency)
// ---------------------------------------------------------------------------
double SystemInfo::getCpuUsage()
{
    FILETIME idleTime, kernelTime, userTime;
    if (!GetSystemTimes(&idleTime, &kernelTime, &userTime))
        return 0.0;

    quint64 idle   = filetimeToUint64(idleTime);
    quint64 kernel = filetimeToUint64(kernelTime);
    quint64 user   = filetimeToUint64(userTime);

    if (!m_initialized) {
        m_prevIdleTime   = idle;
        m_prevKernelTime = kernel;
        m_prevUserTime   = user;
        m_initialized = true;
        return 0.0;
    }

    quint64 idleDiff   = idle   - m_prevIdleTime;
    quint64 kernelDiff = kernel - m_prevKernelTime;
    quint64 userDiff   = user   - m_prevUserTime;

    m_prevIdleTime   = idle;
    m_prevKernelTime = kernel;
    m_prevUserTime   = user;

    quint64 totalSys = kernelDiff + userDiff;  // kernel includes idle
    if (totalSys == 0)
        return 0.0;

    double usage = (1.0 - static_cast<double>(idleDiff) / static_cast<double>(totalSys)) * 100.0;
    // Clamp to [0, 100]
    if (usage < 0.0) usage = 0.0;
    if (usage > 100.0) usage = 100.0;
    // Round to one decimal place
    return static_cast<int>(usage * 10.0 + 0.5) / 10.0;
}

// ---------------------------------------------------------------------------
// CPU name from Windows registry
// ---------------------------------------------------------------------------
QString SystemInfo::getCpuName()
{
    QSettings reg(
        QStringLiteral("HKEY_LOCAL_MACHINE\\HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0"),
        QSettings::NativeFormat);
    QString name = reg.value("ProcessorNameString").toString().trimmed();
    return name.isEmpty() ? QStringLiteral("Unknown") : name;
}

// ---------------------------------------------------------------------------
// Logical processor (core) count
// ---------------------------------------------------------------------------
int SystemInfo::getCpuCores()
{
    SYSTEM_INFO si;
    GetSystemInfo(&si);
    return static_cast<int>(si.dwNumberOfProcessors);
}

// ---------------------------------------------------------------------------
// Memory (total / used) in MB via GlobalMemoryStatusEx
// ---------------------------------------------------------------------------
QJsonObject SystemInfo::getMemoryInfo()
{
    QJsonObject mem;
    MEMORYSTATUSEX ms;
    ms.dwLength = sizeof(ms);
    if (GlobalMemoryStatusEx(&ms)) {
        quint64 totalMB = ms.ullTotalPhys / (1024ULL * 1024ULL);
        quint64 usedMB  = (ms.ullTotalPhys - ms.ullAvailPhys) / (1024ULL * 1024ULL);
        mem["total"] = static_cast<qint64>(totalMB);
        mem["used"]  = static_cast<qint64>(usedMB);
    } else {
        mem["total"] = 0;
        mem["used"]  = 0;
    }
    mem["unit"] = QStringLiteral("MB");
    return mem;
}

// ---------------------------------------------------------------------------
// Disk drives via QStorageInfo (cross-platform, no extra libs)
// ---------------------------------------------------------------------------
QJsonArray SystemInfo::getDiskInfo()
{
    QJsonArray arr;
    const auto volumes = QStorageInfo::mountedVolumes();
    for (const QStorageInfo &vol : volumes) {
        if (!vol.isValid() || !vol.isReady())
            continue;
        // On Windows, rootPath() is like "C:/"
        QString drive = vol.rootPath();
        if (drive.isEmpty())
            continue;
        // Normalise to "C:" style
        if (drive.endsWith('/') || drive.endsWith('\\'))
            drive.chop(1);

        qint64 totalMB = vol.bytesTotal() / (1024LL * 1024LL);
        qint64 freeMB  = vol.bytesAvailable() / (1024LL * 1024LL);
        qint64 usedMB  = totalMB - freeMB;

        if (totalMB <= 0)
            continue;

        QJsonObject disk;
        disk["drive"] = drive;
        disk["total"] = totalMB;
        disk["used"]  = usedMB;
        disk["unit"]  = QStringLiteral("MB");
        arr.append(disk);
    }
    return arr;
}

// ---------------------------------------------------------------------------
// GPU info (best-effort via WMIC / registry)
//
// Full GPU usage reporting requires NVML / ADL or DirectX queries which add
// heavy dependencies.  Here we read just the adapter name from the registry
// (SetupAPI / DirectX description key) and return zeroes for usage values.
// ---------------------------------------------------------------------------
QJsonObject SystemInfo::getGpuInfo()
{
    QJsonObject gpu;
    gpu["name"]         = QStringLiteral("");
    gpu["usage"]        = 0;
    gpu["memory_total"] = 0;
    gpu["memory_used"]  = 0;

    // Try reading the display adapter name from the registry
    // Path: HKLM\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-...}\0000
    static const QString kDisplayClass =
        QStringLiteral("HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0000");
    QSettings reg(kDisplayClass, QSettings::NativeFormat);
    QString name = reg.value("DriverDesc").toString().trimmed();
    if (name.isEmpty())
        name = reg.value("Device Description").toString().trimmed();

    if (!name.isEmpty())
        gpu["name"] = name;

    // GPU usage / memory would require NVML or D3DKMT — left as zero.
    return gpu;
}
