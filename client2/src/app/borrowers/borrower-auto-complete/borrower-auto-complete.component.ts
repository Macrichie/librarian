import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {FormControl} from "@angular/forms";
import {Borrower} from "../shared/Borrower";
import {BorrowersService} from "../shared/borrowers.service";

/**
 * Auto-complete component for borrowers using the borrower last name (or
 * parts of it) for the completion.
 */
@Component({
  selector: 'gsl-borrower-auto-complete',
  templateUrl: './borrower-auto-complete.component.html',
  styleUrls: ['./borrower-auto-complete.component.css']
})
export class BorrowerAutoCompleteComponent implements OnInit {
  /** FormControl for the borrower name input field. */
  input: FormControl;

  /** Borrowers shown in the auto completion list. */
  suggestions: Borrower[];

  @Output()
  borrowerSelected: EventEmitter<Borrower> = new EventEmitter();

  @Input()
  size: number = 20;

  constructor(private borrowersService: BorrowersService) {
  }

  ngOnInit() {
    this.input = new FormControl();
    this.input.valueChanges.subscribe(value => this.onChange(value));
  }

  private onChange(value) {
    if (typeof value === 'object') {
      this.suggestions = [];
      this.input.setValue('');
      this.borrowerSelected.emit(value);
    } else {
      this.fetchSuggestions(value);
    }
  }

  private fetchSuggestions(value) {
    if (value === '') {
      this.suggestions = [];
    } else {
      this.borrowersService.getBorrowers(
        {surname: value}, 0, this.size, false).subscribe(
          borrowers => {
            this.suggestions = borrowers.rows;
          });
    }
  }

  private displayName(borrower: Borrower): string {
    return borrower
      ? `${borrower.surname}, ${borrower.firstname}, ${borrower.contactname}`
      : '';
  }
}
