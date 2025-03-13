import doxygen from "doxygen";
import { createDirectories, cleanDirectory } from "./helpers.js";
import fs from "fs";

class DoxygenRunner {

    constructor(options){
        this.options = options
    }

    async checkInstallation(){
        if(!doxygen.isDoxygenExecutableInstalled(this.options.doxygenVersion)) {
            console.log(`Doxygen is not installed. Downloading ...`)
            const success = await doxygen.downloadVersion(this.options.doxygenVersion);
            if (!success) {
                console.error("Failed to download Doxygen")
                process.exit(1)
            }
        }
    }

    checkXMLOutput(){
        const xmlFiles = fs.readdirSync(this.options.xmlFolder)
        if (xmlFiles.length === 0) {
            console.error(`❌ No XML files found in ${this.options.xmlFolder}.`)
            process.exit(1)
        } else if(this.options.debug){
            console.log(`✅ Found ${xmlFiles.length} XML files.`)
            for (const file of xmlFiles) {
                console.log(`📄 ${file}`)
            }
        }
    }

    prepare(){
        // The configuration options for Doxygen
        const doxyFileOptions = {
            INPUT: this.options.sourceFolder,
            RECURSIVE: "YES",
            GENERATE_HTML: "NO",
            GENERATE_LATEX: "NO",
            GENERATE_XML: this.options.outputXML ? "YES" : "NO", // XML output is required for moxygen
            XML_OUTPUT: this.options.xmlFolder,
            CASE_SENSE_NAMES: "NO", // Creates case insensitive links compatible with GitHub
            FILE_PATTERNS: this.options.fileExtensions.join(" "), // Include only specified file extensions
            EXCLUDE_PATTERNS: this.options.exclude ? this.options.exclude : "",
            EXTRACT_PRIVATE: this.options.accessLevel === "private" ? "YES" : "NO",
            EXTRACT_STATIC: "NO",
            QUIET: this.options.debug ? "NO" : "YES",
            WARN_NO_PARAMDOC: "YES", // Warn if a parameter is not documented
            WARN_AS_ERROR: "FAIL_ON_WARNINGS", // Treat warnings as errors. Continues if warnings are found.
            ENABLE_PREPROCESSING: "NO" // Do not preprocess the source files in order to see #ifdef blocks. Alternatively use PREDEFINED.
        }

        if(this.options.debug) console.log(`🔧 Creating Doxygen config file ${this.options.doxygenConfigFile} ...`)
        doxygen.createConfig(doxyFileOptions, this.options.doxygenConfigFile)

        if(this.options.debug) console.log("🏃 Running Doxygen ...")
        if(doxyFileOptions.GENERATE_XML === "YES") {
            cleanDirectory(this.options.xmlFolder)
            createDirectories([this.options.xmlFolder])
            console.log(`🔨 Generating XML documentation at ${this.options.xmlFolder} ...`)
        }
    }

    extractValidationMessages(error){
        // Replace all "\n  " with " " to meld the error messages into one line        
        let errorMessages = error.stderr.toString().replace(/\n  /g, " ").split("\n")

        // Filter out empty messages and allow only warnings related to documentation issues
        const filteredMessages = errorMessages.filter(message => {
            const warningMessageRegex = /^(?:[^:\n]+):(?:\d+): warning: (?:.+)$/
            return message.match(warningMessageRegex)
        })

        if(this.options.debug){
            // Print messages that were not filtered out and are not empty
            const remainingMessages = errorMessages.filter(message => {
                return !filteredMessages.includes(message) && message !== ""
            })
            for (const message of remainingMessages) {
                console.warn(`🤔 ${message}`)
            }
        }

        return filteredMessages
    }

    async run(){
        let validationMessages = []

        await this.checkInstallation()
        this.prepare()
        try {
            doxygen.run(this.options.doxygenConfigFile, this.options.doxygenVersion)
        } catch (error) {
            const missingLibsErrorMessage = "error while loading shared libraries:"

            if(error.message.includes(missingLibsErrorMessage)) {
                const matches = error.message.match(new RegExp(`${missingLibsErrorMessage} (.+)`))
                console.error(`❌ Failed to run Doxygen due to missing libraries: ${matches.length > 1 ? matches[1] : "unknown"}`)
                process.exit(1)
            }
            validationMessages = this.extractValidationMessages(error)
        }

        if(this.options.outputXML){
            this.checkXMLOutput()
        }

        return validationMessages
    }
}

export default DoxygenRunner;