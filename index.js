#!/usr/bin/env node

import moxygen from "moxygen";
import { program } from "commander";
import fs from "fs";
import DoxygenRunner from "./doxygen-runner.js";
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from "path";
import IssueResolver from "./issue-resolver.js";
import { createDirectories } from "./helpers.js";
import process from "process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DOXYGEN_VERSION = "1.13.2"; // Defines the version of Doxygen to download
const OPENAI_API_KEY_ENV_VAR = "OPENAI_API_KEY"
const TEMPLATES_FOLDER = path.join(__dirname, "templates/cpp")
const PROGRAMMING_LANGUAGE = "cpp"
const BUILD_FOLDER = "./doxygen-build/"
const XML_FOLDER = path.join(BUILD_FOLDER, "xml")
const MOXYGEN_LOGFILE = "./moxygen.log"
const DOXYGEN_CONFIG_FILE = path.join(BUILD_FOLDER, "doxygen.config")

// Extract the command version from the package.json file
const version = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'))).version;

program
  .name('render-docs')
  .description('CLI tool to generate markdown documentation from C++ code using Doxygen')
  .version(version)
  .usage('<sourc folder> [target folder] [options]')

program.argument('<source>', 'Source folder containing the .h files')
program.argument('[target]', 'Target file path / pattern for the markdown documentation (e.g. api.md or %s.md)')
program.option('-e, --exclude <pattern>', 'Pattern for excluding files (e.g. "*/test/*")')
program.option('-c, --include-cpp', 'Process .cpp files when rendering the documentation')
program.option('-a, --access-level <level>', 'Minimum access level to be considered (public, private)', "public")
program.option('-s, --show-access-modifiers', 'Show access modifiers in documentation', false)
program.option('-f, --fail-on-warnings', 'Fail when undocumented code is found', false)
program.option('-d, --debug', 'Enable debugging mode with additional output', false)
program.option('-r, --resolve-issues [api-key]', 'Automatically fix issues in the documentation with OpenAI', false)

if (process.argv.length < 3) {
    program.help();
}
program.parse(process.argv);

const commandArguments = program.args
const sourceFolder = commandArguments[0]
const outputFile = commandArguments[1]
const commandOptions = program.opts()
const includeCppFiles = commandOptions.includeCpp
const outputXML = outputFile !== undefined

let fileExtensions = ["*.h"]
if (includeCppFiles) {
    fileExtensions.push("*.cpp")
}

const doxygenOptions = {
    "outputXML": outputXML,
    "xmlFolder": XML_FOLDER,
    "doxygenConfigFile": DOXYGEN_CONFIG_FILE,
    "sourceFolder": sourceFolder,
    "fileExtensions": fileExtensions,
    "exclude": commandOptions.exclude,
    "accessLevel": commandOptions.accessLevel,
    "debug": commandOptions.debug,
    "doxygenVersion": DOXYGEN_VERSION
}

const doxygenRunner = new DoxygenRunner(doxygenOptions)
let validationMessages = await doxygenRunner.run()

if(validationMessages.length > 0 && commandOptions.resolveIssues){
    console.log("👀 Issues in the documentation were found:")
    for (const message of validationMessages) {
        console.warn(`🤔 ${message}`)
    }

    console.log("🔨 Trying to resolve issues ...")
    const apiKey = typeof commandOptions.resolveIssues === "string" ? commandOptions.resolveIssues : process.env[OPENAI_API_KEY_ENV_VAR]
    const resolver = new IssueResolver(validationMessages, apiKey)
    await resolver.resolve()
    validationMessages = await doxygenRunner.run()
    if(validationMessages.length > 0){
        console.warn("🙈 Remaining issues in the documentation were found. Please check the output.")
    }
}

if(validationMessages.length > 0){
    for (const message of validationMessages) {
        console.warn(`🤔 ${message}`)
    }

    if(commandOptions.failOnWarnings){
        console.error("❌ Issues in the documentation were found. Exiting.")
        process.exit(1)
    }
}

// The configuration options for moxygen
const moxygenOptions = {
    quiet: true,                /** Do not output anything to the console **/
    anchors: false,             /** Don't generate markdown anchors for internal links **/
    htmlAnchors: true,          /** Generate HTML anchors for output **/
    directory: XML_FOLDER,            /** Location of the doxygen files **/
    output: outputFile,           /** Output file **/
    language: PROGRAMMING_LANGUAGE,            /** Programming language **/
    templates: TEMPLATES_FOLDER,     /** Templates directory **/
    relativePaths: true,
    accessLevel: commandOptions.accessLevel,
    showAccessModifiers: commandOptions.showAccessModifiers,
    classes: outputFile.includes("%s"),
    logfile: commandOptions.debug ? MOXYGEN_LOGFILE : undefined
};


if(outputXML){
    if(outputFile){
        const outputFolder = path.dirname(outputFile)
        if(commandOptions.debug) console.log(`🔧 Creating output directory ${outputFolder} ...`)
        // Check if output path exists. If not, create it.
        createDirectories([outputFolder])
    }

    // Apply default options where necessary
    let finalMoxygenOptions = Object.assign({}, moxygen.defaultOptions, moxygenOptions);
    moxygen.logger.init(finalMoxygenOptions);
    console.log("🔨 Generating markdown documentation...")
    moxygen.run(finalMoxygenOptions);
}

if(!commandOptions.debug){
    // Since moxygen uses async file operations, we can only clean up 
    // the build folder when the process exits.
    process.on('exit', () => {
        // Clean up the build folder unless in debug mode
        fs.rmSync(BUILD_FOLDER, { recursive: true })
    })
}

if(validationMessages.length > 0){
    console.warn(`😬 ${validationMessages.length} issues were found in the documentation. Please check the output.`)
}
console.log("✅ Done")