
#include <iostream>
#include <iomanip>
#include "CodeAnalyzer.h"

using namespace std;

int main(int argc, char* argv[]) {

    cout << "\n====================================\n";
    cout << "          CORTEXCODE ENGINE         \n";
    cout << "====================================\n";

    string filePath;

    if (argc >= 2) {
        filePath = argv[1];
    }
    else {
        filePath = "../sample-code/example.cpp";
    }

    try {

        CodeAnalyzer analyzer;

        CodeMetrics result = analyzer.analyzeFile(filePath);

        cout << "\nFILE ANALYSIS REPORT\n";
        cout << "------------------------------------\n";

        cout << "File: " << filePath << endl;

        cout << "\nTotal Lines       : " << result.totalLines;
        cout << "\nCode Lines        : " << result.codeLines;
        cout << "\nComment Lines     : " << result.commentLines;
        cout << "\nBlank Lines       : " << result.blankLines;
        cout << "\nInclude Statements: " << result.includeCount;
        cout << "\nTODO Comments     : " << result.todoCount;

        cout << "\n------------------------------------\n";

        cout << "\nAnalysis completed successfully!\n";

    }
    catch (const exception& error) {
        cerr << "\nError: " << error.what() << endl;
        return 1;
    }

    return 0;
}
