#include "Logger.h"

std::shared_ptr<spdlog::logger> Logger::logger = nullptr;

void Logger::init(const std::string &folderPath, const std::string &fileName)
{
	//폴더 절대경로
	std::string fPath = folderPath;
	//로거 파일 이름
	std::string logFName = fileName;
	//절대경로
	std::string filePath = fPath + "/" + logFName + ".txt";
	//폴더 생성
	CreateDirectoryA(fPath.c_str(), NULL); // (경로, 보안정보[NULL이면 기본 보안 설정])
	//파일로거 생성
	logger = spdlog::basic_logger_mt(logFName, filePath);
	//Set log level
	logger->set_level(spdlog::level::debug);
	//info level 이상의 로그는 즉시 디스크에 flush
	spdlog::flush_on(spdlog::level::info);
}