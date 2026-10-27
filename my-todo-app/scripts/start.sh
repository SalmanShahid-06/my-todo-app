#!/bin/bash
set -e
export HOME=/home/ec2-user
export PATH=/home/ec2-user/.nvm/versions/node/v24.22.0/bin:$PATH
cd /home/ec2-user/todo-app
npm ci --omit=dev
pm2 delete todo-app 2>/dev/null || true
pm2 start npm --name todo-app -- start
pm2 save