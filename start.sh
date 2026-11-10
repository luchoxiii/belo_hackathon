#!/bin/bash
# Start both backend and frontend services

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting Belo Hackathon Services...${NC}"

# Start backend
echo -e "${YELLOW}Starting Python backend on port 8000...${NC}"
cd backend
source venv/bin/activate 2>/dev/null || python3.11 -m venv venv && source venv/bin/activate
pip install -q httpx pydantic starlette uvicorn 2>/dev/null
python simple_server.py &
BACKEND_PID=$!
cd ..

# Wait for backend to be ready
sleep 2

# Start frontend
echo -e "${YELLOW}Starting Next.js frontend on port 3000...${NC}"
cd frontend
source ~/.nvm/nvm.sh 2>/dev/null
nvm use 22 2>/dev/null || true
npm run dev &
FRONTEND_PID=$!
cd ..

echo -e "${GREEN}Services started!${NC}"
echo -e "  Backend:  http://localhost:8000"
echo -e "  Frontend: http://localhost:3000"
echo -e ""
echo -e "Press Ctrl+C to stop all services"

# Handle shutdown
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" SIGINT SIGTERM

# Wait for processes
wait
