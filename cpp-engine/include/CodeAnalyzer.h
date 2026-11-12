
#ifndef CODE_ANALYZER_H
#define CODE_ANALYZER_H

#include <string>

struct CodeMetrics {
    int totalLines = 0;
    int codeLines = 0;
    int commentLines = 0;
    int blankLines = 0;
    int includeCount = 0;v
    int todoCount = 0;
};

class CodeAnalyzer {
public:
    CodeMetrics analyzeFile(const std::string& filePath);
};

#endif
