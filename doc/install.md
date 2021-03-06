# Server Installation

This page describes the installation of the gssblib server on
a new Ubuntu Linux machine.

## Ubuntu packages

- aptitude
- curl
- mysql (pick a good root password and keep it in a safe place)
- gnome-tweak-tool (optional, just to switch caps lock to control)

## Github projects

```
$ cd
$ mkdir -p github/gssb
$ cd github/gssb
$ git clone https://github.com/gssblib/librarian.git
```

The angular/node project can be found under `~/github/gssblib/librarian/`.
The following instructions use the `GSSBLIB_HOME` variable for this directory.


## Install node

The easiest way to install node locally is to use the node version manager
[nvm][nvm]. Install nvm by following the instructions on the nvm page and
then install the latest stable node version with

```
nvm install stable
```

[nvm]: https://github.com/creationix/nvm

After that, `node` and `nvm` should be available. One can see the installation
location with `nvm which`.

## Mysql gssb database

```
$ mysql -p -u root
...
mysql> CREATE USER 'gssb'@'localhost' IDENTIFIED BY '<passwd>';
mysql> CREATE DATABASE spils;
mysql> GRANT ALL ON spils.* TO 'gssb'@'localhost';
mysql> quit
```

### Upload dump

```
$ zcat ./dump-<timestamp>.sql.gz | mysql -p -u gssb spils
```

Check:

```
$ mysql -p -u gssb spils
mysql> select count(*) from items;
```

## Gssblib server

### Create configuration

The server and node based tools get their configuration using the [node config
module][node-config-module].  As shown in the template file
`server/config/template.json`, the configuration contains the server port, the
database connection data, and the salt strings for the session and
authentication.  After creating a `prod.json` configuration file in the same
directory, it can be referenced by setting the `NODE_ENV` environment variable
when running the server or tools.

[node-config-module]: https://github.com/lorenwest/node-config

### Install node and bower modules

To download and install all modules, run the npm and bower installation.

```
$ cd $GSSBLIB_HOME
$ npm install
$ sudo npm install grunt grunt-cli -g
$ grunt bower:install
```

### Setting up config file

```
$ cd $GSSBLIB_HOME/server/config
$ cp template.json prod.json
$ nano prod.json
```

### Add users

Users are added with the `add_user.js` node script which takes the username,
password, and list of roles as arguments.

```
$ cd $GSSBLIB_HOME/server
$ NODE_ENV=prod ./add_user.js some_user some_nice_password librarian
$ NODE_ENV=prod ./add_user.js another_user another_password clerk
```

### Running the server

After this, the server is ready to be started using the `library_server.js`
script and accessed using `http://localhost:<port>/`.

```
$ cd $GSSBLIB_HOME/server
$ NODE_ENV=prod ./library_server.js
```

## Work environment (optional)

To feel comfortable, I also installed my vim configuration:

```
$ cd ~/github
$ mkdir ahohmann
$ cd ahohmann
$ git clone https://github.com/ahohmann/dotfiles.git
$ cd
$ ln -s ./github/ahohmann/dotfiles/.vimrc .vimrc
$ mkdir -p .vim/bundle
$ git clone https://github.com/gmarik/Vundle.vim.git ~/.vim/bundle/Vundle.vim
```


