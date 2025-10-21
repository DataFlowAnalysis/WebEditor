### The content of this repository has been migrated to the [OnlineEditor](https://github.com/DataFlowAnalysis/OnlineEditor) repo.

# Data Flow Analysis - WebEditor

## Setup

To set up the project locally you need to have [Node.js](https://nodejs.org/en/) installed.
Then run the following commands to clone the repository and install the dependencies:

```shell
git clone https://github.com/DataFlowAnalysis/WebEditor.git
cd WebEditor
npm install
```

Installing dependencies must be done after each change to the dependency section in `package.json`.
Therefore, running `npm install` might be necessary after pulling changes from the repository.

## Running locally

To run the project locally for testing or development run the following command:

```shell
npm run dev
```

This will start a local web server. To visit the page either open the URL shown in the console or press `o` in the console.

## Building for production

To build the project for production run the following command:

```shell
npm run build
```

This will create a `dist` folder containing the built static assets. The contents of this folder can be uploaded to a web server to host the project.

This project is built using GitHub Actions and the current built version is hosted on GitHub Pages that can be found [here](https://dataflowanalysis.github.io/WebEditor/).

## Developing

When you want to develop on this project, it is advised to read the [technical documentation](./Documentation.md)
to understand the structure of the project, why things are done the way they are and how the different modules
are structured and interact with each other.
