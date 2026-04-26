const STYLE = `<style>body{background:#0F0F0F;color:#fff;font-family:-apple-system,sans-serif;padding:24px;line-height:1.7;font-size:15px}h1{color:#6C63FF;font-size:26px;margin-bottom:4px}h2{color:#6C63FF;font-size:17px;margin-top:28px;margin-bottom:8px}p,li{color:#cccccc;margin-bottom:10px}ul{padding-left:20px}.sub{color:#888;font-size:13px;margin-bottom:24px}hr{border:none;border-top:1px solid #2A2A2A;margin:24px 0}.footer{text-align:center;color:#888;font-size:12px;font-style:italic;margin-top:32px}strong{color:#fff}a{color:#6C63FF}.summary{background:#1A1A2E;border-left:3px solid #6C63FF;padding:14px 16px;border-radius:8px;margin-bottom:20px;color:#aaa;font-size:13px}</style>`

export const PRIVACY_POLICY_HTML = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0">${STYLE}</head><body>
<h1>Savr</h1><p class="sub">Privacy Policy · Effective Date: April 2026</p>
<div class="summary"><strong>Summary:</strong> Your financial data never leaves your device. It is stored locally and backed up only to your own Google Drive. We never store your expenses on our servers.</div>
<hr/>
<p>At Savr, your privacy is our highest priority. This policy explains exactly what data we collect, where it is stored, and how it is used.</p>
<h2>1. Data Storage Architecture</h2>
<p>Savr uses a privacy-first architecture:</p>
<ul>
<li><strong>All financial data</strong> (expenses, budgets, recurring expenses, spending goals) is stored <strong>locally on your device</strong> using SQLite — it never touches our servers</li>
<li><strong>Backups</strong> are stored in your own <strong>Google Drive</strong> account — only you can access them</li>
<li><strong>Authentication</strong> is handled by Supabase using Google Sign In — we store only your identity, not your financial data</li>
</ul>
<h2>2. Information We Collect</h2>
<p><strong>Stored on your device only:</strong></p>
<ul>
<li>Expense amounts, categories, notes and dates</li>
<li>Budget limits and recurring expense settings</li>
<li>Spending goals</li>
<li>App preferences (currency, notification settings)</li>
</ul>
<p><strong>Stored on our servers (Supabase) for account management only:</strong></p>
<ul>
<li>Email address (from Google Sign In)</li>
<li>Full name and profile picture (from Google Sign In)</li>
<li>Phone number (only if you voluntarily add it in Settings)</li>
<li>Device model and Android version (for support and analytics)</li>
<li>App version installed</li>
<li>Last active timestamp</li>
</ul>
<p><strong>Stored in your Google Drive:</strong></p>
<ul>
<li>Encrypted backup of your expense data in a private Savr folder</li>
<li>Only accessible by you and the Savr app</li>
</ul>
<h2>3. Google Drive Backup</h2>
<p>Savr automatically backs up your data to a <strong>Savr</strong> folder in your Google Drive. This backup:</p>
<ul>
<li>Is stored in your personal Google Drive account</li>
<li>Is only accessible by you and the Savr app</li>
<li>Contains your expenses, budgets, recurring expenses, and goals</li>
<li>Is used to restore your data when you reinstall or switch devices</li>
<li>Can be deleted at any time by deleting the Savr folder from your Google Drive</li>
</ul>
<p>We use the <strong>drive.file</strong> scope which only allows Savr to access files it creates � we cannot access any other files in your Google Drive.</p>
<h2>4. Advertising</h2>
<p>Savr displays advertisements powered by <strong>Google AdMob</strong> to keep the app free.</p>
<p><strong>We will never sell your personal or financial data to advertisers.</strong> Your expense data is never shared with advertisers.</p>
<p>Google AdMob may use device identifiers to show relevant ads. You can opt out of personalized ads through your device settings under <strong>Google ? Ads ? Opt out of Ads Personalization</strong>.</p>
<p>For more information, visit <a href="https://policies.google.com/privacy">Google's Privacy Policy</a>.</p>
<h2>5. How We Use Your Information</h2>
<ul>
<li>Authenticate your identity via Google Sign In</li>
<li>Restore your data when you reinstall or switch devices</li>
<li>Send local notifications such as budget alerts and weekly summaries</li>
<li>Display advertisements via Google AdMob</li>
<li>Understand app usage patterns to improve Savr (using anonymized analytics)</li>
<li>Provide customer support</li>
</ul>
<h2>6. Data Sharing</h2>
<p>We do not sell your personal data. We share information only with:</p>
<ul>
<li><strong>Supabase</strong> — stores your account profile (not financial data) securely on our behalf</li>
<li><strong>Google Drive</strong> — stores your backup in your own account</li>
<li><strong>Google AdMob</strong> — serves advertisements within the app</li>
<li><strong>Legal authorities</strong> — if required by law or court order</li>
</ul>
<h2>7. Third Party Services</h2>
<ul>
<li><strong>Supabase</strong> — account authentication and profile storage. <a href="https://supabase.com/privacy">Privacy Policy</a></li>
<li><strong>Google Sign In</strong> — authentication service. <a href="https://policies.google.com/privacy">Privacy Policy</a></li>
<li><strong>Google Drive API</strong> — backup storage in your personal Drive. <a href="https://policies.google.com/privacy">Privacy Policy</a></li>
<li><strong>Google AdMob</strong> — advertisement service. <a href="https://policies.google.com/privacy">Privacy Policy</a></li>
</ul>
<h2>8. Data Security</h2>
<ul>
<li>Financial data is stored locally on your device — never transmitted to our servers</li>
<li>All network communications use encrypted HTTPS/TLS</li>
<li>Supabase uses row-level security ensuring only you can access your profile</li>
<li>Google Drive backup is protected by your Google account security</li>
</ul>
<h2>9. Data Retention</h2>
<p>Your financial data lives on your device and in your Google Drive — you control it completely. Your account profile on our servers is retained as long as your account is active.</p>
<p>To delete your account and all associated server-side data, visit our <a href="https://007wary.github.io/savr/delete-account.html">Delete Account page</a> or contact us at <a href="mailto:007mwnswrangwary@gmail.com">007mwnswrangwary@gmail.com</a>. We will respond within 30 days.</p>
<h2>10. Children's Privacy</h2>
<p>Savr is not intended for users under the age of 13. We do not knowingly collect data from children under 13. If we become aware of such data, we will delete it promptly.</p>
<h2>11. Your Rights</h2>
<ul>
<li><strong>Access</strong> — all your financial data is on your device and accessible at any time</li>
<li><strong>Export</strong> — export your data as CSV from the History screen</li>
<li><strong>Backup</strong> — back up and restore your data via Google Drive</li>
<li><strong>Correction</strong> — edit any expense or profile data directly in the app</li>
<li><strong>Deletion</strong> — delete your account and all server-side data at any time</li>
<li><strong>Opt out of ads</strong> — opt out of personalized ads via device settings</li>
</ul>
<h2>12. Changes to This Policy</h2>
<p>We may update this policy from time to time. We will notify you of any material changes through the app. The effective date at the top of this page will always reflect the latest version.</p>
<h2>13. Contact Us</h2>
<p>App: Savr — Developer: Wary Dev. — Email: <a href="mailto:007mwnswrangwary@gmail.com">007mwnswrangwary@gmail.com</a></p>
<hr/><p class="footer">Savr — Spend smart, save more.</p>
</body></html>`

export const TERMS_HTML = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0">${STYLE}</head><body>
<h1>Savr</h1><p class="sub">Terms of Service — Effective Date: April 2026</p><hr/>
<p>Welcome to Savr. By downloading or using the app, you agree to these Terms of Service. Please read them carefully.</p>
<h2>1. Acceptance of Terms</h2>
<p>By accessing or using Savr, you agree to be bound by these Terms of Service and our Privacy Policy. If you do not agree, please do not use the app.</p>
<h2>2. Description of Service</h2>
<p>Savr is a personal expense tracking application that allows you to:</p>
<ul>
<li>Track daily expenses with automatic category detection</li>
<li>Set and monitor monthly budgets with AI-powered recommendations</li>
<li>View detailed spending reports, trends, and insights</li>
<li>Set up recurring expenses that auto-log on schedule</li>
<li>Set monthly spending goals and track progress</li>
<li>Export your data as CSV</li>
<li>Automatically back up your data to your personal Google Drive</li>
<li>Restore your data on a new device from your Google Drive backup</li>
</ul>
<p><strong>Important:</strong> Savr stores all your financial data locally on your device. Your expenses, budgets, and goals are never stored on our servers. Backups go to your own Google Drive account only.</p>
<h2>3. User Accounts</h2>
<ul>
<li>Savr uses Google Sign In exclusively — no password is required</li>
<li>You must have a valid Google account to use Savr</li>
<li>You are responsible for maintaining access to your Google account</li>
<li>You must be at least 13 years old to use Savr</li>
<li>One person may not maintain more than one account</li>
<li>You must notify us immediately of any unauthorized use of your account</li>
</ul>
<h2>4. User Data and Ownership</h2>
<ul>
<li>You own all financial data you enter into Savr</li>
<li>Your financial data is stored locally on your device — we do not have access to it</li>
<li>Backups are stored in your personal Google Drive — only you can access them</li>
<li>You are responsible for maintaining access to your Google Drive backups</li>
<li>You can export your data as CSV at any time from the History screen</li>
<li>Deleting the app will delete all local data — restore from Google Drive backup to recover it</li>
</ul>
<h2>5. Google Drive Backup</h2>
<ul>
<li>Savr automatically backs up your data to a Savr folder in your Google Drive</li>
<li>We use the drive.file scope — Savr can only access files it creates in your Drive</li>
<li>You can delete the backup at any time by removing the Savr folder from your Drive</li>
<li>We are not responsible for data loss if you delete your Google Drive backup</li>
<li>Backup and restore features require an active internet connection</li>
</ul>
<h2>6. Acceptable Use</h2>
<p>You agree not to:</p>
<ul>
<li>Use the app for any illegal or unauthorized purpose</li>
<li>Attempt to gain unauthorized access to our systems or other users' accounts</li>
<li>Interfere with or disrupt the integrity or performance of the app</li>
<li>Reverse engineer or attempt to extract the source code of the app</li>
<li>Use automated tools to access or interact with the app</li>
<li>Use the app to store or transmit malicious, harmful, or offensive content</li>
</ul>
<h2>7. Advertising</h2>
<p>Savr displays advertisements powered by <strong>Google AdMob</strong> to keep the app free. By using Savr you consent to the display of advertisements.</p>
<p><strong>We will never sell your personal or financial data to advertisers.</strong></p>
<p>Google AdMob may use device identifiers to serve relevant ads. You can opt out of personalized ads in your device settings under <strong>Google ? Ads ? Opt out of Ads Personalization</strong>.</p>
<h2>8. Third Party Services</h2>
<p>Savr integrates with the following third party services:</p>
<ul>
<li><strong>Supabase</strong> — account authentication and profile management. <a href="https://supabase.com/terms">Terms</a> — <a href="https://supabase.com/privacy">Privacy</a></li>
<li><strong>Google Sign In</strong> — authentication service. <a href="https://policies.google.com/terms">Terms</a> — <a href="https://policies.google.com/privacy">Privacy</a></li>
<li><strong>Google Drive API</strong> — backup storage in your personal Google Drive. <a href="https://policies.google.com/terms">Terms</a> — <a href="https://policies.google.com/privacy">Privacy</a></li>
<li><strong>Google AdMob</strong> — in-app advertising. <a href="https://policies.google.com/terms">Terms</a> — <a href="https://policies.google.com/privacy">Privacy</a></li>
</ul>
<p>By using Savr, you also agree to the terms of these third party services.</p>
<h2>9. Intellectual Property</h2>
<p>All content, design, code, and branding in Savr is owned by Wary Dev. You may not copy, modify, distribute, or create derivative works without written permission. Your data belongs to you.</p>
<h2>10. Disclaimer of Warranties</h2>
<p>Savr is provided "as is" without warranties of any kind, express or implied. We do not guarantee that the app will be error-free, uninterrupted, or meet your specific requirements.</p>
<p><strong>Savr is for personal financial tracking only and does not constitute professional financial, tax, or investment advice.</strong> Always consult a qualified professional for financial decisions.</p>
<h2>11. Limitation of Liability</h2>
<p>To the maximum extent permitted by applicable law, Savr and its developer shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of or inability to use the app, including but not limited to loss of data, loss of profits, or financial loss.</p>
<p>Our total liability to you for any claims arising from these terms shall not exceed INR 500.</p>
<h2>12. Data Loss</h2>
<p>Since your financial data is stored locally on your device, we strongly recommend:</p>
<ul>
<li>Enabling automatic Google Drive backup (enabled by default in Savr)</li>
<li>Periodically exporting your data as CSV from the History screen</li>
<li>Not deleting the Savr folder from your Google Drive</li>
</ul>
<p>We are not responsible for data loss caused by device failure, accidental deletion, uninstalling the app, or loss of access to your Google Drive account.</p>
<h2>13. Termination</h2>
<ul>
<li>You may stop using the app and delete your account at any time via the <a href="https://007wary.github.io/savr/delete-account.html">Delete Account page</a></li>
<li>Deleting your account removes your profile from our servers</li>
<li>Your local data and Google Drive backup are unaffected by account deletion — you must delete them separately</li>
<li>We reserve the right to suspend or terminate accounts that violate these terms</li>
</ul>
<h2>14. Changes to Terms</h2>
<p>We may update these terms from time to time. We will notify you of any material changes through the app. The effective date at the top of this page will always reflect the latest version. Continued use of the app after changes constitutes acceptance of the new terms.</p>
<h2>15. Governing Law</h2>
<p>These terms are governed by the laws of India. Any disputes arising from these terms shall be subject to the exclusive jurisdiction of the courts of India.</p>
<h2>16. Contact Us</h2>
<p>App: Savr — Developer: Wary Dev. — Email: <a href="mailto:007mwnswrangwary@gmail.com">007mwnswrangwary@gmail.com</a></p>
<hr/><p class="footer">Savr — Spend smart, save more.</p>
</body></html>`
