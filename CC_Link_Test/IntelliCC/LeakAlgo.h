#pragma once
#include <iostream>
#include <vector>
#include <cmath>
#include <fstream>
#include <filesystem>
#include <string>
#include <chrono>
#include <Eigen/Dense>

extern "C" {
#include "mpfit.h"
}

namespace fs = std::filesystem;

/* ================================
   Utility functions
================================ */

std::vector<double> baseline_normalize(const std::vector<double>& p) {
	std::vector<double> out(p.size());
	double p0 = p.front();
	for (size_t i = 0; i < p.size(); ++i)
		out[i] = p[i] - p0;
	return out;
}

/* ================================
   MPFIT model definition
================================ */

struct FitData {
	std::vector<double> t;
	std::vector<double> p;
};

int pressure_model_mpfit(
	int m, int n, double* p,
	double* dy, double** dvec,
	void* private_data
) {
	auto* data = static_cast<FitData*>(private_data);

	double P0 = p[0];
	double A = p[1];
	double tau = p[2];
	double B = p[3];

	for (int i = 0; i < m; ++i) {
		double ti = data->t[i];
		double model =
			P0 +
			A * (1.0 - std::exp(-ti / tau)) +
			B * ti;
		dy[i] = data->p[i] - model;
	}
	return 0;
}
/* ================================
   Statistical metrics
================================ */

double compute_r_squared(
	const std::vector<double>& y,
	const std::vector<double>& yfit
) {
	double mean = 0.0;
	for (double v : y) mean += v;
	mean /= y.size();

	double ss_res = 0.0, ss_tot = 0.0;
	for (size_t i = 0; i < y.size(); ++i) {
		ss_res += std::pow(y[i] - yfit[i], 2);
		ss_tot += std::pow(y[i] - mean, 2);
	}
	return 1.0 - ss_res / ss_tot;
}

double calculate_gv(const Eigen::MatrixXd& cov) {
	double det = cov.determinant();
	if (det > 0)
		return std::log10(det);
	return 999.0;
}

double calculate_cn(const Eigen::MatrixXd& cov) {
	Eigen::JacobiSVD<Eigen::MatrixXd> svd(cov);
	double cond = svd.singularValues()(0) /
		svd.singularValues().tail(1)(0);
	if (cond > 0 && std::isfinite(cond))
		return std::log10(cond);
	return 20.0;
}

/* ================================
   Inspection class
================================ */

class VacuumLeak {
private:
	double fs; //HZ
	double time_inspection; //전체 검사 시간 EX)45.6 = 5.1(진공펌핑시간) + 19.5(안정화시간) + 21(검사시간)
	double time_pumping; //진공 펌프 시간 (설비 자체적으로 부여하는 delay도 추가할것)
	double time_stabilization; //안정화 시간 (설비 자체적으로 부여하는 delay도 추가할것)

	int idx_start, idx_end, idx_pumping, len_stabilization; //인덱스

	std::vector<std::vector<double>> list_data; //input data

	struct ResultRow {
		double leak_idx, deltap, r2;
		double P0, A, tau, B;
		double gv, cn, redchi;
		int success;
		std::string message;
	};

	std::vector<ResultRow> results;

	void set_params() {
		idx_start = int(fs * time_pumping + fs * 1);
		//idx_end = int(fs * time_inspection);
		idx_end = int(time_inspection);
		idx_pumping = int(fs * time_pumping);
		//len_stabilization = int(fs * time_stabilization);
		len_stabilization = int(time_stabilization);
	}


	void add_data(std::vector<std::vector<double>>& input_data) {

		list_data = input_data;

		//Todo : 라인별 세팅 값에 따라 나누기 
		for (int i = 0; i < input_data.size(); i++) {
			for (int j = 0; j < input_data[i].size(); j++) {
				list_data[i][j] = (input_data[i][j] / 10);
			}
		}

	}

	void init_data() {
		list_data.clear();
		results.clear();
	}

	void inspection() {
		for (auto& data : list_data) {
			double deltap =
				std::abs(
					data[idx_pumping + len_stabilization] -
					data[idx_end]
				);

			std::vector<double> area(
				data.begin() + idx_start,
				data.begin() + idx_end
			);

			area = baseline_normalize(area);

			FitData fitdata;
			int m = area.size();
			fitdata.p = area;
			fitdata.t.resize(m);
			for (int i = 0; i < m; ++i)
				fitdata.t[i] = i / fs;

			double p0[4] = { 0, 5, 4, 0 };
			mp_par pars[4];
			memset(pars, 0, sizeof(pars));
			pars[2].limited[0] = 1;
			pars[2].limits[0] = 1e-6;

			double covar[16];
			mp_result result;
			memset(&result, 0, sizeof(result));

			mpfit(
				pressure_model_mpfit,
				m, 4, p0, pars,
				nullptr, &fitdata, &result
			);

			double leak_idx = (p0[3] * p0[2]) / p0[1];

			//Todo : 공분산
			Eigen::Matrix<double, 4, 4, Eigen::RowMajor> cov =
				Eigen::Map<Eigen::Matrix<double, 4, 4, Eigen::RowMajor>>(covar);

			//Eigen::MatrixXd cov = Eigen::Map<Eigen::MatrixXd>(
			//	result.covar, 4, 4
			//	);

			std::vector<double> yfit(m);
			for (int i = 0; i < m; ++i) {
				double ti = fitdata.t[i];
				yfit[i] =
					p0[0] +
					p0[1] * (1.0 - std::exp(-ti / p0[2])) +
					p0[3] * ti;
			}

			double r2 = compute_r_squared(area, yfit);

			results.push_back({
				leak_idx,
				deltap,
				r2,
				p0[0], p0[1], p0[2], p0[3],
				calculate_gv(cov),
				calculate_cn(cov),
				result.bestnorm,
				result.status,
				"OK"
				});
		}
	}

	void save_results() {
		std::ofstream fout("result.csv");
		fout << "leak_idx,deltap,r_squared,P0,A,tau,B,"
			"generalized_variance,condition_number,"
			"reduced_chi_square,success,message\n";

		for (auto& r : results) {
			fout << r.leak_idx << "," << r.deltap << "," << r.r2 << ","
				<< r.P0 << "," << r.A << "," << r.tau << "," << r.B << ","
				<< r.gv << "," << r.cn << "," << r.redchi << ","
				<< r.success << "," << r.message << "\n";
		}
	}

public:
	VacuumLeak(
		double fs,
		double time_inspection,
		double time_pumping,
		double time_stabilization
	)
		:
		fs(fs),
		time_inspection(time_inspection),
		time_pumping(time_pumping),
		time_stabilization(time_stabilization)
	{}

	struct public_result {
		double leak_idx, deltap, r2;
		double P0, A, tau, B;
		double gv, cn, redchi;
		int success;
		std::string message;
	};

	std::vector<public_result> get_result() {
		std::vector<public_result> return_result;
		for (int i = 0; i < results.size(); i++) {
			ResultRow r = results[i];
			public_result temp_result{
				r.leak_idx, r.deltap, r.r2,
				r.P0, r.A, r.tau, r.B,
				r.gv, r.cn, r.redchi,
				r.success, r.message
			};
			return_result.push_back(temp_result);
		}
		return return_result;
	}

	void process(std::vector<std::vector<double>>& input_data) {
		init_data();
		set_params();
		add_data(input_data);
		inspection();
		save_results();
	}

	void change_params(double fs, double time_inspection, double time_pumping, double time_stabilization) {
		this->fs = fs;
		this->time_inspection = time_inspection;
		this->time_pumping = time_pumping;
		this->time_stabilization = time_stabilization;
	}
};

/* ================================
   main
================================ */

void tmp() {
	std::vector<std::vector<double>> input_data = { {} }; //input Data

	VacuumLeak vaccumLeak(19.56, 60.6, 5.1, 10.5);
	//파라미터를 데이터에 입력
	vaccumLeak.process(input_data);
	//데이터 출력
	std::vector<VacuumLeak::public_result> fianl = vaccumLeak.get_result();
}
//int main() {
//
//	//HZ
//	//전체 검사 시간 EX)45.6 = 5.1(진공펌핑시간) + 19.5(안정화시간) + 21(검사시간)
//	//진공 펌프 시간 (설비 자체적으로 부여하는 delay도 추가할것)
//	//안정화 시간 (설비 자체적으로 부여하는 delay도 추가할것)
//	//2차원 벡터로 입력.
//
//	std::vector<std::vector<double>> input_data = { {} }; //input Data
//
//	VacuumLeak vaccumLeak(19.56, 60.6, 5.1, 10.5);
//	//파라미터를 데이터에 입력
//	vaccumLeak.process(input_data);
//	//데이터 출력
//	std::vector<VacuumLeak::public_result> fianl = vaccumLeak.get_result();
//	return 0;
//}