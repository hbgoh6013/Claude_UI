#include "IntelliCC.h"
#include <QtWidgets/QApplication>

int main(int argc, char *argv[])
{
    QApplication a(argc, argv);

	g_baseDir = QCoreApplication::applicationDirPath();
	g_logDir = QDir(g_baseDir).filePath("Logs");
	qRegisterMetaType<std::vector<uint8_t>>("std::vector<uint8_t>");

    IntelliCC w;
    w.show();
    return a.exec();
}
