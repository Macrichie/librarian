/**
 * Service module for the GSSB library database.
 */
const Q = require('q'),
      merge = require('merge'),
      entity = require('./entity');

module.exports = {
  /**
   * Factory function creating a new GSSB library service object.
   *
   * If provided, the 'time' object must have a function 'now' that returns
   * the current time as a JavaScript Date object.
   *
   * @param db mysql-promise database object
   * @param config optional configuration with borrowDays and renewalDays
   * @param time optional time source that can be used to override time functions
   * @return library service with entities borrowers, items, checkouts, and history
   */
  create: function (db, config, time) {
    config = merge({ borrowDays: 21, renewalDays: 21 }, config);
    time = time || { now: function() { return new Date(); }};

    // borrowers table/entity
    var borrowers = entity(db, {
      name: 'borrowers',
      columns: [
        'borrowernumber', 'cardnumber',
        {name: 'firstname', queryOp: 'contains'},
        {name: 'contactname', queryOp: 'contains'},
        {name: 'surname', queryOp: 'contains'},
        'streetaddress', 'city', 'zipcode', 'phone',
        {name: 'emailaddress', queryOp: 'contains'},
        'emailaddress_2', 'state'],
      naturalKey: 'borrowernumber'});

    /**
     * Override the 'create' method to first compute the next borrowernumber
     * and cardnumber if not provided.
     */
    borrowers.create = function (obj) {
      var self = this;
      if (obj.borrowernumber) {
        if (!obj.cardnumber) {
          obj.cardnumber = 100000000 + obj.borrowernumber;
        }
        return borrowers.constructor.prototype.create.call(self, obj);
      } else {
        return db.selectRow(
            'select max(borrowernumber) as max_borrowernumber from borrowers')
          .then(function (data) {
            obj.borrowernumber = 1 + data.max_borrowernumber;
            obj.cardnumber = 100000000 + obj.borrowernumber;
            return borrowers.constructor.prototype.create.call(self, obj);
          });
      }
    };

    /**
     * Returns promise of checkout records joined with the associated item
     * information. The table is either the checkouts table 'out' or the history
     * table 'issue_history'. If feesOnly is true, only records with outstanding
     * fees will be returned.
     */
    function getCheckouts(table, borrowerNumber, feesOnly) {
      var sql = 'select a.*, b.* from items a ' +
        'inner join ' + table + ' b on a.barcode = b.barcode ' +
        'where b.borrowernumber = ?';
      if (feesOnly) {
        sql += ' and b.fine_due > b.fine_paid';
      }
      return db.selectRows(sql, borrowerNumber);
    }

    borrowers.checkouts = function (borrowerNumber, feesOnly) {
      return getCheckouts('`out`', borrowerNumber, feesOnly);
    }

    borrowers.history = function (borrowerNumber, feesOnly) {
      return getCheckouts('issue_history', borrowerNumber, feesOnly);
    }

    /**
     * Returns the total amount due for the given items.
     */
    function totalFine(items) {
      return items.reduce(function (total, item) {
        return total + item.fine_due - item.fine_paid;
      }, 0);
    }

    /**
     * Returns promise of the fees a borrower has to pay with the associated
     * items (currently checked out or already returned).
     */
    borrowers.fees = function (borrowerNumber) {
      var self = this;
      var result = {};
      return Q.all([
          self.checkouts(borrowerNumber, true),
          self.history(borrowerNumber, true)]).then(function (data) {
        var newFeeItems = data[0].rows;
        var oldFeeItems = data[1].rows;
        return {
          total: totalFine(newFeeItems) + totalFine(oldFeeItems),
          items: newFeeItems,
          history: oldFeeItems
        };
      });
    };

    /**
     * Override the borrowers' get method to optionally fetch the checked out
     * items, history, and fees.
     */
    borrowers.get = function (borrowernumber, options) {
      var self = this;
      options = options || {};
      return self.constructor.prototype.get.call(self, borrowernumber).then(
        function (borrower) {
          var extras = [];
          if (options.items) {
            extras.push(self.checkouts(borrowernumber)
              .then(function (items) { borrower.items = items.rows; }));
          }
          if (options.history) {
            extras.push(self.history(borrowernumber)
              .then(function (history) { borrower.history = history.rows; }));
          }
          if (options.fees) {
            extras.push(self.fees(borrowernumber)
              .then(function (fees) { borrower.fees = fees; }));
          }
          return Q.all(extras).then(function () { return borrower; });
        });
    };

    /**
     * Pays all outstanding fees of a borrower.
     */
    borrowers.payFees = function (borrowerNumber) {
      return borrowers.get(borrowerNumber).then(function (borrower) {
        return Q.all([
          db.query(
            'update `out` set fine_paid = fine_due ' +
            'where fine_due > fine_paid and borrowernumber = ?',
            borrowerNumber),
          db.query(
            'update issue_history set fine_paid = fine_due ' +
            'where fine_due > fine_paid and borrowernumber = ?',
            borrowerNumber)]);
      });
    };

    /**
     * Renews all items of a borrower.
     */
    borrowers.renewAllItems = function (borrowerNumber) {
      new_date_due = addDays(time.now(), config.renewalDays);
      return db.query(
        'update `out` ' +
        'set date_due = ? ' +
        'where borrowernumber = ?', [new_date_due, borrowerNumber]);
    };

    /**
     * Returns promise of the list of borrowers with fees due.
     */
    borrowers.allFees = function () {
      function feeQuery(table) {
        return 'select * from (' +
          'select a.borrowernumber, a.surname, a.contactname, a.firstname, ' +
          'sum(if(b.fine_paid > b.fine_due, 0, b.fine_due - b.fine_paid)) as fee ' +
          'from borrowers a join ' + table + ' b on a.borrowernumber = b.borrowernumber ' +
          'group by a.borrowernumber) fees where fee > 0';
      }
      return Q.all([db.selectRows(feeQuery('`out`')),
                    db.selectRows(feeQuery('issue_history'))])
        .then(function (data) {
          var borrowers = {};
          var newItems = data[0].rows;
          var oldItems = data[1].rows;
          newItems.forEach(function (borrower) {
            borrower.newFee = borrower.fee;
            borrower.oldFee = 0;
            borrowers[borrower.borrowernumber] = borrower;
          });
          oldItems.forEach(function (borrower) {
            borrower.oldFee = borrower.fee;
            borrower.newFee = 0;
            if (borrowers[borrower.borrowernumber] === undefined) {
              borrowers[borrower.borrowernumber] = borrower;
            } else {
              borrowers[borrower.borrowernumber].fee += borrower.fee;
              borrowers[borrower.borrowernumber].oldFee = borrower.fee;
            }
          });
          return Object.keys(borrowers).map(function (key) { return borrowers[key]; });
        });
    };

    // items table/entity
    var items = entity(db, {
      name: 'items',
      columns: [
        'barcode', 'description', 'subject', 'added', 'itemlost',
        {name: 'title', queryOp: 'contains'},
        {name: 'author', queryOp: 'contains'},
        'publicationyear', 'publishercode', 'age', 'media', 'serial',
        {name: 'seriestitle', queryOp: 'contains'},
        'classification', 'country', 'itemnotes', 'replacementprice', 'issues',
        'state',
        {name: 'antolin_sticker', type: entity.types.boolean},
        'isbn10', 'isbn13'],
      naturalKey: 'barcode'});

    var checkoutColumns = [
      'borrowernumber', 'barcode', 'checkout_date', 'date_due',
      'returndate', 'renewals', 'fine_due', 'fine_paid'];

    // `out` table containing the current checkouts
    var checkouts = entity(db, {
        name: 'checkouts',
        tableName: 'out',
        columns: checkoutColumns,
        naturalKey: 'barcode'});

    checkouts.updateFees = function (date) {
      return db.query('update `out` set fine_due = if(date_due < ?, 0.5, 0)', date);
    };

    checkouts.payFee = function (barcode) {
      return db.query('update `out` set fine_paid = fine_due where barcode = ?', barcode);
    };

    // `issue_history` table containing the checkout copies for returned items
    var history = entity(db, {
        name: 'history',
        tableName: 'issue_history',
        columns: checkoutColumns});

    history.payFee = function (id) {
      return db.query('update issue_history set fine_paid = fine_due where id = ?', id);
    }

    /**
     * Returns the promise of the issue_history entries for the item with the given
     * barcode. Adds the surname of the associated borrower.
     */
    function getItemHistory(barcode) {
      var sql = 'select h.*, b.surname from issue_history h, borrowers b ' +
        'where h.barcode = ? and h.borrowernumber = b.borrowernumber';
      return db.selectRows(sql, barcode);
    }

    /**
     * Returns the promise of an item together with its checkout information.
     * Throws an error if the item does not exist.
     */
    items.get = function (barcode, options) {
      var self = this;
      options = options || {};
      var result;
      return items.constructor.prototype.get.call(self, barcode)
        .then(function (item) {
          result = item;
          return checkouts.find(barcode);
        })
        .then(function (checkout) {
          if (checkout) {
            result.checkout = checkout;
            return borrowers.get(checkout.borrowernumber).then(function (borrower) {
              result.borrower = borrower;
              return result;
            });
          } else {
            return result;
          }
        })
        .then(function () {
          if (options['history']) {
            return getItemHistory(barcode).then(function (history) {
              result.history = history.rows;
              return result;
            });
          } else {
            return result;
          }
        })
        .then(function () {
          // Try and look up antolin information by ISBN13 or ISBN10.
          if (result.isbn13) {
            return antolin.get(result.isbn13).then(
                function (entry) {
                  result.antolin = entry;
                  return result;
                },
                function (err) {
                  if (err.code !== 'ENTITY_NOT_FOUND') {
                    console.log("antolin lookup failed", err);
                  }
                  return result;
                });
          } else if (result.isbn10) {
            return antolin.read({isbn10: result.isbn10}).then(
                function (data) {
                  if (data.rows && data.rows.length > 0) {
                    result.antolin = data.rows[0];
                  }
                  return result;
                },
                function (err) {
                  console.log("isbn10 antolin lookup error", err);
                  return result;
                });
          } else {
            return result;
          }
        });
    };

    /**
     * Returns promise to result containing items and their checkout status.
     */
    items.read = function (query, limit) {
      /* Seems hacky, but better than other options. */
      if ('antolin' in query) {
        query['antolin'] = (query['antolin'] == 'true');
      }
      var self = this;
      var result;
      return items.constructor.prototype.read.call(self, query, limit)
        .then(function (items) {
          result = items;
          return Q.all(
            items.rows.map(function(item) {
              return checkouts.find(item.barcode);
            }))
            .then(function(checkouts) {
              for (i=0; i < result.rows.length; ++i) {
                result.rows[i].checkout = checkouts[i]
              }
              return result;
            });
        });
    };

    /**
     * Returns promise to result containing item and checkout.
     *
     * Throws an error if the item does not exist or is not checked out,
     */
    function getCheckedOutItem(barcode) {
      return items.get(barcode).then(function (data) {
        if (!data.checkout) {
          throw {httpStatusCode: 400, code: 'ITEM_NOT_CHECKED_OUT', errno: 1101};
        }
        return data;
      });
    }

    /**
     * Returns promise of returning an item. The returned object contains the
     * borrower, item, and checkout.
     */
    items.checkin = function (barcode) {
      var result;
      var checkoutId;
      return getCheckedOutItem(barcode)
        .then(function (data) {
          result = data;
          var checkout = data.checkout;
          checkoutId = checkout.id;

          // Copy checkout to history.
          checkout.returndate = new Date();
          delete checkout.id;
          return history.create(checkout);
        })
        .then(function () {
          // If successfully copied to history, remove from checkouts.
          return checkouts.remove(checkoutId);
        })
        .then(function () { return result; });
    };

    /**
     * Returns the given date plus the days as a new date.
     */
    function addDays(date, days) {
      var newDate = new Date(date);
      newDate.setDate(newDate.getDate() + days);
      return newDate;
    }

    /**
     * Returns the promise of renewing an item. The returned object contains
     * item, updated checkout, and borrower.
     */
    items.renew = function (barcode) {
      var result;
      return getCheckedOutItem(barcode).then(function (data) {
        result = data;
        var checkout = data.checkout;
        checkout.date_due = addDays(time.now(), config.renewalDays);
        return checkouts.update({id: checkout.id, date_due: checkout.date_due});
      }).then(function () { return result; });
    };

    /**
     * Returns the promise of checking out an item. The result contains
     * the item, checkout, and borrower.
     */
    items.checkout = function (barcode, params) {
      var borrowerNumber = params.borrower;
      var result = {};
      return borrowers.get(borrowerNumber)
        .then(function (borrower) {
          result.borrower = borrower;
          return items.get(barcode);
        })
        .then(function (item) {
          if (item.checkout) {
            throw {
              httpStatusCode: 400, code: 'ITEM_ALREADY_CHECKED_OUT', errno: 1105,
              checkout: item.checkout
            };
          }
          if (item.state !== 'CIRCULATING') {
            throw {
              httpStatusCode: 400, code: 'ITEM_NOT_CIRCULATING', errno: 1106,
              item: item
            };
          }
          result.item = item;
          return null;
        })
        .then(function () {
          return checkouts.create({
            borrowernumber: borrowerNumber,
            barcode: barcode,
            checkout_date: new Date(),
            date_due: addDays(new Date(), config.borrowDays),
            returndate: null,
            renewals: 0,
            fine_due: 0,
            fine_paid: 0
          });
        })
        .then(function () { return checkouts.get(barcode); })
        .then(function (checkout) {
          result.checkout = checkout;
          return result;
        });
    };

    var reports = {};

    reports.getItemUsage = function(query) {
      var itemsWhere = items.sqlWhere(query);
      var sql = 'select a.barcode, a.title, a.author, ' +
                'max(h.checkout_date) as last_checkout_date ' +
                'from items a, issue_history h ' +
                itemsWhere.sql +
                ' and a.barcode = h.barcode ' +
                'group by a.barcode having last_checkout_date < ?';
      itemsWhere.params.push(query.lastCheckoutDate);
      console.log(sql);
      return db.selectRows(sql, itemsWhere.params);
    };

    // antolin table/entity
    var antolin = entity(db, {
      name: 'antolin',
      columns: [
        'author', 'title', 'publisher',
        'isbn10', 'isbn10_formatted', 'isbn13', 'isbn13_formatted',
        'book_id', 'available_since', 'grade', 'num_read'
      ],
      naturalKey: 'isbn13'});

    antolin.get = function (isbn) {
      var self = this;
      return antolin.constructor.prototype.get.call(self, isbn)
        .then(function (entry) {
          entry.link = 'https://www.antolin.de/all/bookdetail.jsp?book_id=' + entry.book_id;
          return entry;
        });
    };

    return {
      borrowers: borrowers,
      items: items,
      checkouts: checkouts,
      history: history,
      reports: reports,
      antolin: antolin
    };
  }
};
