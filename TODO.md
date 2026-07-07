# general

- categories page can scroll way past end of page
- categories are duplicated

# ui

- change color of sidebar
- clicking on the avatar should allow opening a image from disk or searching google image and upload from it (optimize image process on backend)

# transactions

- allow dismiss a transaction from the unmatched transactions

# transaction list

- add account column for transactions
- remove the "new" and "new merchant" logic and ui from the transaction row 
- clicking a transaction should open it in a side view with more details, which should be in an outlet of the transaction page. this side detailed view should be a page that displays in that outlet. 
- clicking the category badge show open the dropdown that exist in the @MerchantAssignmentModal (@CategoryPicker) to change the category on the fly
- transactions list should only show the merchant name when it has a match instead of just the avatar

# rules

- create rule from description + price
- creating a new merchant should allow setting the image directly from the client rule

# import

- handling arrondi

# categories

- searching the @CategoryPicker should also show nested categories
- the add category modal should provide the @CategoryPicker to show where the category will be added, and be changed if needed. inspire yourself from @MerchantAssignmentModal which already defines this field.
- when searching something and has no result in the category picker, show a proposition to create a new category from search, then if entered, show the Add category modal, pre-filled with the string from the search. 
