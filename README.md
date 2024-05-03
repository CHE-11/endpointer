# Endpointer
Endpointer is a fast way to jump from an endpoint call in the frontend to the actually route in the backend. 

If you work in a monorepo like I tend to do, you know how annoying it can be to have to jump between the frontend and backend to find the route that is being called. You end up going to an index file that lists all the routes, then you have to find the route that is being called. It's a pain. 


## Usage
The extension gives you one option on the right click context menu: 
- Paste Endpoint Template ➜ This pastes an endpoint template that you can fill in with the endpoint and method. 

There are two options in the command palette:
- Paste Endpoint Template ➜ This pastes an endpoint template that you can fill in with the endpoint and method. 
- Reindex Workspace

## Config
There are three settings that can be changed: 
- endpointer.endpointTemplateFormat - This is the format that is used to get the details about the endpoint on the backend. 
  - Default is ```// ENDPOINTER <> "method": "GET", "endpoint": "/api/endpoint" ```
- endpoint.endpointRegex ➜ This is the regex that is used to find the endpoint in the backend. 
  - Default is ```\/\/ ENDPOINTER <> \"(method)\": \"(GET|POST|PUT|DELETE)\", \"endpoint\": \"(.+)\"```
- endpointer.frontendCallRegex ➜ This is the regex that is used to find the endpoint call in the frontend. 
  - Default is ```/fetch\((?:'|")(.+)(?:'|")\)/```
- endpointer.linkColor ➜ This is the color that the link will be in the endpoint template. 
  - Default is ```#0000FF```
  - This can be any valid css color.
- endpointer.showLinkIcon ➜ This is a boolean that determines if the link icon is shown in the endpoint template. 
  - Default is ```true```


## Development
To work on the extension, simple clone the repo, and run ```yarn install``` to install the dependencies. Then run the VS Code command ```Start Debugging``` to start the extension in a new window.


## Packaging
If you don't have vsce install already, run ```npm install -g vsce``` to install it. 
Then run ```vsce package``` to create a .vsix file. You can then install this file in VS Code by running the command ```Extensions: Install from VSIX...``` in the command palette or right clicking on the file in vscode and selecting ```Install Extension VSIX```.


## Limitations



## Acknowlegements


