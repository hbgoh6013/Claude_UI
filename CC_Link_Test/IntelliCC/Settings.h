#pragma once
#include<iostream>
#include<qsettings.h>
#include<QtWidgets/QMainWindow>

#include <QFile>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonArray>
#include <QDebug>

#include "Global.h"

class Settings
{


public:
	Settings();
	~Settings();

	void load();
	void save();
	void updateReadAddresses(const QJsonArray &addresses);

private:

	QString m_path;

};

