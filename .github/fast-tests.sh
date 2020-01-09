#! /bin/sh
echo "Running test 📝"
Y | apt-get update
Y | apt-get install sudo
# curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | sudo apt-key add -
# echo "deb https://dl.yarnpkg.com/debian/ stable main" | sudo tee /etc/apt/sources.list.d/yarn.list
# sudo apt update
# sudo apt install yarn
# yarn run test
Y | sudo apt install npm
npm run test