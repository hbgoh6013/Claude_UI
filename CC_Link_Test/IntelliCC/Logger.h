#pragma once
#pragma once
#include <QtWidgets/QtWidgets>
#include<iostream>
#include<spdlog/spdlog.h>
#include<spdlog/sinks/basic_file_sink.h>

class Logger
{
public:
	static void init(const std::string &folderPath, const std::string &fileName);
	static std::shared_ptr<spdlog::logger> logger;
};

