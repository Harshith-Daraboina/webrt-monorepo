const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function checkDatabase() {
  try {
    console.log('🔍 Checking database connection...');
    await prisma.$connect();
    console.log('✅ Database connected successfully!');
    
    console.log('\n📊 Checking database contents...');
    
    const rooms = await prisma.room.findMany();
    console.log(`\n📍 Rooms in database: ${rooms.length}`);
    rooms.forEach(room => {
      console.log(`  - ${room.id}: ${room.name} (${room.status})`);
    });
    
    const sessions = await prisma.session.findMany();
    console.log(`\n👥 Sessions in database: ${sessions.length}`);
    sessions.forEach(session => {
      console.log(`  - ${session.id}: User ${session.userId} in Room ${session.roomId} (${session.status})`);
    });
    
    const messages = await prisma.message.findMany();
    console.log(`\n💬 Messages in database: ${messages.length}`);
    messages.slice(0, 10).forEach(msg => {
      console.log(`  - ${msg.userId}: ${msg.content.substring(0, 50)}...`);
    });
    
    await prisma.$disconnect();
    console.log('\n✅ Database check complete!');
  } catch (error) {
    console.error('❌ Database error:', error);
    process.exit(1);
  }
}

checkDatabase();
