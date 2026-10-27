#!/bin/bash
set -e
cp /home/ec2-user/todo-app.env /home/ec2-user/todo-app/.env
chown -R ec2-user:ec2-user /home/ec2-user/todo-app