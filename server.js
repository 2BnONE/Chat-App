const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const nodemailer = require('nodemailer'); 
const url = require('url'); 

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// -------------------------------------------------------------------
// 1. Configuration and Constants (Deployment Ready)
// -------------------------------------------------------------------

const ADMIN_EMAIL = 'salahabd.735113@gmail.com'; 

// يستخدم متغير البيئة PUBLIC_URL الذي تحدده منصة الاستضافة لروابط الإيميل
const SERVER_BASE_URL = process.env.PUBLIC_URL || 'http://localhost:3000';    

// Nodemailer setup - CRITICAL CHANGE: Using Environment Variables
const transporter = nodemailer.createTransport({
    service: 'gmail', 
    auth: {
        // 🚨 سيتم قراءة الإيميل المرسل من متغير بيئة اسمه EMAIL_USER
        user: process.env.EMAIL_USER, 
        // 🚨 سيتم قراءة كلمة مرور التطبيق من متغير بيئة اسمه EMAIL_PASS
        pass: process.env.EMAIL_PASS           
    }
});

// -------------------------------------------------------------------
// 2. Server State (To store requests and approved users)
// -------------------------------------------------------------------

let nextUserId = 100;
const pendingRequests = {}; 
const approvedClients = {}; 

// -------------------------------------------------------------------
// 3. Email Sending Function
// -------------------------------------------------------------------

function sendApprovalEmail(userId, userName) {
    const approvalLink = `${SERVER_BASE_URL}/approve?user_id=${userId}&action=ACCEPT`;
    const rejectionLink = `${SERVER_BASE_URL}/approve?user_id=${userId}&action=REJECT`;

    const mailOptions = {
        from: `ChatApp Notifier <${transporter.options.auth.user}>`,
        to: ADMIN_EMAIL,
        subject: `🚨 New Join Request: ${userName}`,
        html: `
            <h2>New Chat Room Join Request</h2>
            <p>Username: <strong>${userName}</strong></p>
            <p>Please approve or reject by clicking the appropriate button:</p>
            <table cellspacing="0" cellpadding="0" style="width: 100%;">
                <tr>
                    <td style="padding: 15px 0 10px 0;">
                        <table cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
                            <tr>
                                <td align="center" style="border-radius: 5px; background-color: #4CAF50; margin-right: 20px;">
                                    <a href="${approvalLink}" target="_blank" style="padding: 10px 20px; border: 1px solid #4CAF50; border-radius: 5px; font-family: Arial, sans-serif; font-size: 15px; color: #ffffff; text-decoration: none; display: inline-block;">Accept (ACCEPT)</a>
                                </td>
                                <td style="width: 20px;"></td>
                                <td align="center" style="border-radius: 5px; background-color: #F44336;">
                                    <a href="${rejectionLink}" target="_blank" style="padding: 10px 20px; border: 1px solid #F44336; border-radius: 5px; font-family: Arial, sans-serif; font-size: 15px; color: #ffffff; text-decoration: none; display: inline-block;">Reject (REJECT)</a>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        `
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error("❌ Error sending email:", error);
        } else {
            console.log(`✅ Approval email sent for ${userName}`);
        }
    });
}

// -------------------------------------------------------------------
// 4. HTTP Handler (For Approval and Rejection Links)
// -------------------------------------------------------------------

app.get('/approve', (req, res) => {
    const userId = parseInt(req.query.user_id);
    const action = req.query.action; 

    const request = pendingRequests[userId];

    if (!request) {
        return res.send('<h1>❌ Error: Pending request not found or already processed.</h1>'); 
    }

    if (action === 'ACCEPT') {
        const response = JSON.stringify({ 
            type: 'approval_status', 
            status: 'approved',
            name: request.name 
        });
        request.ws.send(response);
        
        approvedClients[userId] = request.ws;
        approvedClients[userId].userName = request.name;

        delete pendingRequests[userId];
        
        return res.send(`
            <script>
                alert("SUCCESS: User ${request.name} approved. You can close this window now.");
                window.close();
            </script>
            <h1>✅ User Approved!</h1>
        `); 
    } 
    
    if (action === 'REJECT') {
        request.ws.send(JSON.stringify({ 
            type: 'approval_status', 
            status: 'rejected' 
        }));
        delete pendingRequests[userId];
        
        return res.send(`
            <script>
                alert("REJECTED: User ${request.name} was rejected. You can close this window now.");
                window.close();
            </script>
            <h1>🚫 User Rejected!</h1>
        `);
    }

    return res.send('<h1>⚠️ Invalid action.</h1>');
});


// -------------------------------------------------------------------
// 5. WebSocket Handler (For receiving messages and join requests)
// -------------------------------------------------------------------

wss.on('connection', function connection(ws) {
    ws.userId = nextUserId++; 
    console.log(`🔌 New connection established: ID ${ws.userId}`);

    ws.on('message', function incoming(message) {
        const text = message.toString('utf8');
        
        try {
            const data = JSON.parse(text);

            if (data.type === 'join_request') {
                const userName = data.name;
                
                pendingRequests[ws.userId] = { name: userName, ws: ws };
                
                sendApprovalEmail(ws.userId, userName);
                console.log(`✉️ Join request sent to admin from: ${userName}`);

            } 
        } catch (e) {
            if (approvedClients[ws.userId]) {
                const userName = approvedClients[ws.userId].userName || 'Unknown User';
                const messageToSend = `${userName}: ${text}`;

                wss.clients.forEach(function each(client) {
                    if (client.readyState === WebSocket.OPEN && approvedClients[client.userId]) {
                        client.send(messageToSend); 
                    }
                });
                console.log(`📢 Message broadcasted from ${userName}`);
            }
        }
    });

    ws.on('close', () => {
        delete pendingRequests[ws.userId];
        delete approvedClients[ws.userId];
        console.log(`🚫 Connection closed: ID ${ws.userId}`);
    });
});

// -------------------------------------------------------------------
// 6. Start the Server
// -------------------------------------------------------------------

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'Chat-App.html')); 
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`✨ Approval server is now running on port: ${PORT}`);
    console.log(`Please open your browser at the following link: ${SERVER_BASE_URL}`);
});