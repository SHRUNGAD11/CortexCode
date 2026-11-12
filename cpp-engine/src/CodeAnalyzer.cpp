#include <stdexcept>
#include "CodeAnalyzer.h"

#include <fstream>
#include <algorithm>
#include <cctype>

using namespace std;

CodeMetrics CodeAnalyzer::analyzeFile(const string& filePath) {

    CodeMetrics metrics;

    ifstream file(filePath);

    if (!file.is_open()) {
        throw runtime_error("Unable to open source file: " + filePath);
    }

    string line;
    bool insideBlockComment = false;

    while (getline(file, line)) {

        metrics.totalLines++;

        bool hasCode = false;
        bool hasComment = false;
        bool insideString = false;
        bool insideChar = false;
        bool escaped = false;

        for (size_t i = 0; i < line.length(); i++) {

            char current = line[i];
            char next = (i + 1 < line.length()) ? line[i + 1] : '\0';

            if (insideBlockComment) {
                hasComment = true;

                if (current == '*' && next == '/') {
                    insideBlockComment = false;
                    i++;
                }
                continue;
            }

            if (insideString || insideChar) {

                hasCode = true;

                if (escaped) {
                    escaped = false;
                }
                else if (current == '\\') {
                    escaped = true;
                }
                else if (insideString && current == '"') {
                    insideString = false;
                }
                else if (insideChar && current == '\'') {
                    insideChar = false;
                }

                continue;
            }

            if (current == '"') {
                insideString = true;
                hasCode = true;
                continue;
            }

            if (current == '\'') {
                insideChar = true;
                hasCode = true;
                continue;
            }

            if (current == '/' && next == '/') {
                hasComment = true;
                break;
            }

            if (current == '/' && next == '*') {
                hasComment = true;
                insideBlockComment = true;
                i++;
                continue;
            }

            if (!isspace(static_cast<unsigned char>(current))) {
                hasCode = true;
            }
        }

        if (!hasCode && !hasComment) {
            metrics.blankLines++;
        }
        else if (!hasCode && hasComment) {
            metrics.commentLines++;
        }
        else if (hasCode) {
            metrics.codeLines++;
        }

        string trimmed = line;

        size_t first = trimmed.find_first_not_of(" \t");

        if (first != string::npos) {
            trimmed = trimmed.substr(first);

            if (trimmed.find("#include") == 0) {
                metrics.includeCount++;
            }
        }

        if (line.find("TODO") != string::npos) {
            metrics.todoCount++;
        }
    }

    return metrics;
}
