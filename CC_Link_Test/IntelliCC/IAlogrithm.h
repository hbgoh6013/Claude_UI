#pragma once
#include"LeakAlgo.h"
#include <QtWidgets/QtWidgets>

typedef std::map<QString, std::vector<double>> data_t;

class IAlogrithm : public QObject
{
	Q_OBJECT

signals:

public slots:
	void onStartLeakInsp(data_t data);
public:

protected:

private:


};

