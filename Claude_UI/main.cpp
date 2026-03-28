#include "Claude_UI.h"
#include <QtWidgets/QApplication>

int main(int argc, char *argv[])
{
    QApplication app(argc, argv);
    Claude_UI window;
    window.show();
    return app.exec();
}
