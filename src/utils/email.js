/**
 * Email utility — wraps nodemailer with a single reusable sendEmail function.
 *
 * Required environment variables:
 *   EMAIL_USER  — Gmail address used as the sender (e.g. tarasplus502@gmail.com)
 *   EMAIL_PASS  — Gmail App Password (generate at myaccount.google.com/apppasswords)
 *
 * Optional environment variable:
 *   EMAIL_FROM_NAME — Display name shown in the From field (default: "FinanceAI")
 */

'use strict';

const nodemailer = require('nodemailer');

const EMAIL_USER     = process.env.EMAIL_USER     || '';
const EMAIL_PASS     = process.env.EMAIL_PASS     || '';
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || 'FinanceAI';

// Create the transporter once and reuse it across calls.
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS,
    },
});

/**
 * Send an email.
 *
 * @param {string} to        - Recipient email address.
 * @param {string} subject   - Email subject line.
 * @param {string} body      - Email body. Treated as HTML when isHtml is true (default),
 *                             or plain text when isHtml is false.
 * @param {object} [options] - Optional overrides.
 * @param {boolean} [options.isHtml=true]  - Send body as HTML (true) or plain text (false).
 * @param {string}  [options.from]         - Override the From address entirely.
 * @returns {Promise<boolean>} Resolves to true on success, false on failure.
 */
async function sendEmail(to, subject, body, options = {}) {
    const { isHtml = true, from } = options;

    if (!EMAIL_PASS) {
        console.warn(`⚠️  EMAIL_PASS is not set — skipping email to ${to}`);
        console.info(`📧 Subject: ${subject}`);
        // Return true so callers are not blocked during local development.
        return true;
    }

    const mailOptions = {
        from: from || `${EMAIL_FROM_NAME} <${EMAIL_USER}>`,
        to,
        subject,
        [isHtml ? 'html' : 'text']: body,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.info(`📧 Email sent → ${to} | Subject: ${subject}`);
        return true;
    } catch (err) {
        console.error(`❌ Failed to send email to ${to}:`, err.message);
        return false;
    }
}

module.exports = { sendEmail };
