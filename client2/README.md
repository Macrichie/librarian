# Angular 2 Client for the GSSB Library Application

The skeleton of this project was create with [Angular
CLI](https://github.com/angular/angular-cli), see [./README_CLI.md].

The application uses [PrimeNG](https://www.primefaces.org/primeng/#/) as the
widget library.

## Steps

* install angular-cli
  * `npm install -g @angular/cli`
* create ng project with `ng new client2` from parent directory
* in this project, add PrimeNG and font-awesome npm libraries
  * `npm install primeng --save`
  * `npm install font-awesome --save`
* add PrimeNG and font-awesome CSS files to `styles.css`

## Generating application structure

```
$ ng generate module core
$ ng generate module items
$ ng generate service core/config
$ ng generate component items/item
$ ng generate service items/shares/items

