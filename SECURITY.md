# Security Policy

## Supported Versions

We release patches for security vulnerabilities in the following versions:

| Version | Supported          |
| ------- | ------------------ |
| latest  | :white_check_mark: |

## Reporting a Vulnerability

We take the security of Cadence seriously. If you believe you have found a security vulnerability, please report it to us as described below.

### How to Report

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please use GitHub's private vulnerability reporting feature:

1. Go to the [Security tab](https://github.com/yadava5/cadence/security) of this repository
2. Click "Report a vulnerability"
3. Fill out the form with the details below

You should receive a response within 48 hours.

Please include the following information in your report:

- **Type of issue** (e.g., buffer overflow, SQL injection, cross-site scripting, etc.)
- **Full paths of source file(s)** related to the manifestation of the issue
- **The location of the affected source code** (tag/branch/commit or direct URL)
- **Any special configuration required to reproduce the issue**
- **Step-by-step instructions to reproduce the issue**
- **Proof-of-concept or exploit code** (if possible)
- **Impact of the issue**, including how an attacker might exploit it

### What to Expect

1. **Acknowledgment**: We will acknowledge receipt of your vulnerability report within 48 hours.

2. **Communication**: We will keep you informed of our progress as we work to understand and address the issue.

3. **Resolution**: Once the issue is resolved, we will notify you and discuss the appropriate timeline for public disclosure.

4. **Credit**: We are happy to credit security researchers who report valid issues in our release notes (unless you prefer to remain anonymous).

## Security Best Practices for Contributors

When contributing to this project, please:

1. **Never commit sensitive data**: API keys, passwords, tokens, or any other secrets should never be committed to the repository.

2. **Use environment variables**: All sensitive configuration should be handled through environment variables.

3. **Keep dependencies updated**: Regularly check for and apply security updates to dependencies.

4. **Follow secure coding practices**:
   - Validate and sanitize all user inputs
   - Use parameterized queries for database operations
   - Implement proper authentication and authorization
   - Use HTTPS for all external communications

5. **Review your code**: Before submitting a PR, review your changes for potential security implications.

## Security Features

Cadence implements the following security measures:

- **Authentication**: JWT-based authentication with access/refresh token rotation
- **Password Security**: Passwords are hashed using bcrypt
- **Input Validation**: All inputs are validated using Zod schemas
- **CORS Protection**: Configurable CORS policies
- **Rate Limiting**: API rate limiting to prevent abuse
- **SQL Injection Prevention**: Parameterized queries for all database operations

## Dependencies

We regularly audit our dependencies for known vulnerabilities using:

```bash
npm audit
```

If you notice any vulnerable dependencies, please report them through the same process as other security issues.

## Disclosure Policy

When we receive a security bug report, we will:

1. Confirm the problem and determine affected versions
2. Audit code to find any similar problems
3. Prepare fixes for all supported versions
4. Release new versions and update the changelog
5. Announce the vulnerability (with appropriate credit to the reporter)

Thank you for helping keep Cadence and our users safe!
