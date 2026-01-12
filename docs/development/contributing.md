# Contributing to stac-server

Thank you for your interest in contributing to stac-server! This document provides guidelines and instructions for setting up your development environment and contributing to the project.

## Table of Contents

- [Development Environment Setup](#development-environment-setup)
- [Contributing to Documentation](#contributing-to-documentation)
- [Running Tests](#running-tests)
  - [Running Unit Tests](#running-unit-tests)
  - [Running System and Integration Tests](#running-system-and-integration-tests)
- [Code Quality](#code-quality)
  - [Linting](#linting)
  - [Type Checking](#type-checking)
  - [OpenAPI Validation](#openapi-validation)
- [Updating the OpenAPI Specification](#updating-the-openapi-specification)
- [Pull Request Process](#pull-request-process)
- [Reporting Issues](#reporting-issues)
- [Code of Conduct](#code-of-conduct)

## Development Environment Setup

Install [NVM](https://github.com/nvm-sh/nvm) to manage your Node.js environment:

```shell
# uses version in .nvmrc
nvm install
nvm use
```

The package-lock.json was built with npm 8.5.0, so use at least this version.

Install dependencies:

```shell
npm install
```

Useful npm commands:

```shell
# Build the project (runs webpack)
npm run build

# Run ESLint
npm run lint

# Run both unit and system tests (requires running docker compose containers)
npm run test

# Run the API locally
npm run serve
```

[npm-check-updates](https://www.npmjs.com/package/npm-check-updates) can be used for
updating version dependencies to newer ones:

```shell
ncu -i
```

## Contributing to Documentation

The stac-server documentation is built using [MkDocs](https://www.mkdocs.org/) with the [Material theme](https://squidfunk.github.io/mkdocs-material/). This section will help you set up the documentation environment and understand our documentation standards.

### Setting Up Documentation Environment

Install the required Python packages:

```shell
pip install -r requirements-docs.txt
```

!!! tip "Virtual Environment"
    Consider using a Python virtual environment to avoid conflicts with system packages:
    ```shell
    python -m venv venv
    source venv/bin/activate  # On Windows: venv\Scripts\activate
    pip install -r requirements-docs.txt
    ```

### Building Documentation Locally

Serve the documentation locally with live reload:

```shell
mkdocs serve
```

The documentation will be available at `http://127.0.0.1:8000/`.

Build the documentation site:

```shell
mkdocs build
```

The built site will be in the `site/` directory.

### Versioned Documentation

We use [mike](https://github.com/jimporter/mike) for versioning documentation. To deploy a new version:

```shell
# Deploy a new version (e.g., v4.5)
mike deploy v4.5 latest --update-aliases

# Serve all versions locally
mike serve
```

### Documentation Structure

The documentation is organized in the `docs/` directory:

- **getting-started/**: Installation and quick start guides
- **usage/**: Basic usage and searching
- **configuration/**: Configuration options
- **deployment/**: Deployment guides for AWS, Azure, other platforms
- **reference/**: Architecture, API reference, STAC compliance
- **development/**: Contributing, development workflow
- **about/**: Changelog, license, support

### Documentation Standards

#### Markdown Guidelines

- Use ATX-style headers (`##` not underlines)
- Use fenced code blocks with language identifiers
- Use relative links for internal documentation
- Include alt text for images

#### MkDocs Material Features

**Admonitions** for callouts:

```markdown
!!! note "Optional Title"
    Content here

!!! warning
    Warning content

!!! tip
    Helpful tip
```

**Code blocks** with titles:

```markdown
```python title="example.py"
def hello():
    print("Hello, world!")
```
```

**Tabs** for alternative content:

```markdown
=== "Tab 1"
    Content for tab 1

=== "Tab 2"
    Content for tab 2
```

**Navigation cards** on the homepage use Material's grid system.

#### Updating OpenAPI Documentation

The OpenAPI specification is built from JSDoc comments in the source code and deployed to `docs/api-spec.html`. To update:

1. Update JSDoc comments in TypeScript source files
2. Run `npm run build-api-docs` to generate the OpenAPI spec
3. The GitHub Actions workflow automatically builds and deploys it

#### Linking Best Practices

- Use relative paths: `[Architecture](../reference/architecture.md)`
- Link to specific sections: `[Search](../usage/search.md#basic-search)`
- Verify all links work by building locally

#### Diagrams

We use [Mermaid](https://mermaid.js.org/) for diagrams. Example:

```markdown
```mermaid
graph LR
    A[Client] --> B[API Gateway]
    B --> C[Lambda]
    C --> D[OpenSearch]
```
```

### Documentation Workflow

1. Make changes to markdown files in `docs/`
2. Preview changes with `mkdocs serve`
3. Verify all links and formatting work correctly
4. Commit changes and open a pull request
5. The GitHub Actions workflow will automatically deploy approved changes

## Running Locally

Before the API can be run, OpenSearch and Localstack need to be running. There is a `compose.yml` file to simplify running OpenSearch locally:

```shell
docker compose up -d
```

The API can then be run with:

```shell
npm run serve
```

Connect to the server on <http://localhost:3000/>

Other configurations can be passed as shell environment variables, e.g.,

```shell
export ENABLE_TRANSACTIONS_EXTENSION=true
export OPENSEARCH_HOST='https://search-stac-server-dev-7awl6h344qlpvly.us-west-2.es.amazonaws.com'
npm run serve
```

## Running Tests

stac-server uses [ava](https://github.com/avajs/ava) as its test runner.

### Running Unit Tests

```shell
# Run all unit tests
npm run test:unit

# Run unit tests with coverage
npm run test:unit:coverage

# Run tests from a single test file whose titles match 'foobar*'
npx ava tests/unit/test-es.js --match='foobar*'
```

### Running System and Integration Tests

The System and Integration tests use an OpenSearch server running in Docker and a local instance of the API.

When the system tests run, they:

1. Wait for OpenSearch to be available
2. Delete all indices from OpenSearch
3. Start an instance of the API at <http://localhost:3000/dev/>
4. Wait for the API to be available
5. Run the system tests in `./tests/system/test-*.js`
6. Stop the API

**Prerequisites:**

Before running system tests, start OpenSearch:

```shell
docker compose up -d
```

Running these tests requires the `timeout` utility. On Linux, this is probably already installed. On macOS, install it with:

```shell
brew install coreutils
```

**Running system tests:**

```shell
# Run all system tests
npm run test:system

# Run system tests with coverage
npm run test:system:coverage

# Run a subset of system tests matching a glob pattern
npm run test:system test-api-item-*
```

**Running all tests:**

```shell
npm test
```

## Code Quality

### Linting

stac-server uses [ESLint](https://eslint.org/) for code linting:

```shell
# Run linter
npm run lint

# Auto-fix linting issues
npm run lint-js-fix
```

Please ensure your code passes linting before submitting a pull request.

### Type Checking

stac-server uses TypeScript for type checking:

```shell
npm run typecheck
```

### OpenAPI Validation

Validate the OpenAPI specification:

```shell
npm run check-openapi
```

## Updating the OpenAPI Specification

The OpenAPI specification is served by the `/api` endpoint and is located at [src/lambdas/api/openapi.yaml](https://github.com/stac-utils/stac-server/blob/main/src/lambdas/api/openapi.yaml).

When the API is updated to a new STAC API release, this file must be updated:

1. Install [yq](https://github.com/mikefarah/yq)

2. Run the build script:

```shell
bin/build-openapi.sh
```

This script combines all of the STAC API OpenAPI definitions for each conformance class into one file.

3. Edit the file to make it specific to this server:
   - Change the title from `STAC API - Item Search` to `STAC API`
   - Remove all Filter Extension references (if not supported)
   - Fix each endpoint, especially the Landing Page definition (which gets duplicated)
   - Add definitions for each tag

4. Validate the resulting OpenAPI file:

```shell
npm run check-openapi
```

Fix any errors or warnings reported.

## Pull Request Process

1. **Fork the repository** and create a new branch from `main` for your changes.

2. **Make your changes** following the code style and conventions used in the project.

3. **Write or update tests** to cover your changes. Ensure all tests pass:
   ```shell
   npm test
   ```

4. **Run linting and type checking**:
   ```shell
   npm run lint
   npm run typecheck
   ```

5. **Update documentation** if you're adding or changing functionality:
   - Update README.md for user-facing features
   - Update code comments and JSDoc
   - Update OpenAPI specification if API changes are made

6. **Commit your changes** with clear, descriptive commit messages following conventional commit format when possible.

7. **Push to your fork** and submit a pull request to the `main` branch.

8. **Respond to feedback** from maintainers during the review process.

### Pull Request Guidelines

- Keep pull requests focused on a single feature or bug fix
- Include a clear description of the problem and solution
- Reference any related issues using GitHub keywords (e.g., "Fixes #123")
- Ensure CI checks pass before requesting review
- Be responsive to review feedback

## Reporting Issues

When reporting issues, please include:

- A clear, descriptive title
- Steps to reproduce the issue
- Expected behavior vs actual behavior
- Your environment (Node.js version, OS, etc.)
- Relevant logs or error messages
- Screenshots if applicable

Use the [GitHub issue tracker](https://github.com/stac-utils/stac-server/issues) to report bugs or request features.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

## Getting Help

- Check existing [documentation](../index.md), [usage guide](../usage/index.md), and [deployment guide](../deployment/index.md)
- Search [existing issues](https://github.com/stac-utils/stac-server/issues)
- Ask questions in discussions or create a new issue

## Next Steps

- **Reference > [Architecture](../reference/architecture.md)** - Understand the system architecture
- **Guides > [Usage](../usage/index.md)** - Learn how to use the API
- **Reference > [API Overview](../reference/api.md)** - Complete endpoint specifications

Thank you for contributing to stac-server!
