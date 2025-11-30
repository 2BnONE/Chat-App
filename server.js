const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Map لتخزين العملاء المتصلين وأسمائهم (لربط اسم المستخدم بالاتصال)
const clients = new Map(); 

// -------------------------------------------------------------------
// 1. WebSocket Handler 
// -------------------------------------------------------------------

wss.on('connection', function connection(ws) {
    console.log('🔌 New client connected.');

    // عند استقبال رسالة
    ws.on('message', function incoming(message) {
        const text = message.toString('utf8');
        
        // 🚨 الرسالة الأولى هي طلب الانضمام
        if (!clients.has(ws)) {
            try {
                const data = JSON.parse(text);
                
                if (data.type === 'join') {
                    const userName = data.name;
                    clients.set(ws, { name: userName });
                    
                    const systemMessage = JSON.stringify({
                        type: 'system',
                        message: `انضم ${userName} إلى الدردشة.`,
                    });
                    
                    // إعلان انضمام المستخدم الجديد للجميع
                    wss.clients.forEach(function each(client) {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(systemMessage);
                        }
                    });
                    console.log(`✅ User joined: ${userName}`);
                }
            } catch (e) {
                console.error("❌ First message was not a join request:", text);
            }
            return;
        }

        // 💬 الرسائل اللاحقة (رسائل الدردشة)
        const clientData = clients.get(ws);
        const userName = clientData ? clientData.name : 'Unknown User';
        
        // تنسيق رسالة الدردشة وإرسالها كـ JSON
        const chatMessage = JSON.stringify({
            type: 'chat',
            sender: userName,
            message: text, 
        });

        // بث الرسالة المنسقة للجميع
        wss.clients.forEach(function each(client) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(chatMessage);
            }
        });
        console.log(`📢 Message from ${userName}: ${text}`);
    });

    // عند قطع الاتصال
    ws.on('close', () => {
        const clientData = clients.get(ws);
        if (clientData) {
            const userName = clientData.name;
            clients.delete(ws);
            
            const systemMessage = JSON.stringify({
                type: 'system',
                message: `غادر ${userName} الدردشة.`,
            });
            
            // إعلان المغادرة
            wss.clients.forEach(function each(client) {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(systemMessage);
                }
            });
            console.log(`🚫 Client disconnected: ${userName}`);
        } else {
             clients.delete(ws);
             console.log('🚫 Client disconnected (before joining)');
        }
    });
});

// -------------------------------------------------------------------
// 2. Start the Server
// -------------------------------------------------------------------

// تقديم ملف HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'Chat-App.html')); 
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`✨ Chat server is now running on port: ${PORT}`);
});