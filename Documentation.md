# Technical documentation

## Tech Stack

To work on this project you need some knowledge about the following
used technologies:

- [TypeScript](https://www.typescriptlang.org/)

    Used as the programming language for the project.
    All used libraries have good typings and this project is big enough
    to benefit from the type safety TypeScript provides compared to plain JavaScript.

- [vite](https://vitejs.dev/)

    Used as the ts/css bundler and dev server.
    It has a fast development server which automatically reloads the page on
    TypeScript changes and automatically applies CSS changes without reloading the page.
    vite is used as a bundler to transpile the TypeScript to JavaScript,
    bundle the dependencies into JS chunks and bundle the CSS into a single CSS file.

    You don't need to know much about vite. The dev server is started using `npm run dev`,
    a static build is created using `npm run build`.
    The page is in `index.html` but is pretty empty besides the `script` tag that loads
    `src/index.ts` as the main application entry point.
    CSS should just be imported in any included TypeScript file and will be bundled automatically.

    Note that the generated static site, which is output in `dist/`,
    expects to run on an HTTP(S) server and does not work when
    being opened directly from the file system.
    For testing the statically built site any HTTP server will do, e.g. `python3 -m http.server`.
    For hosting the application in production you should use a proper HTTP server like nginx or apache2 with proper configuration.

- [sprotty](https://sprotty.org/)

    sprotty is used as the core diagramming framework.
    It provides the diagram canvas, is responsible for rendering the diagram,
    zooming, panning, edge routing, etc.

    To work on this project you _definitely need_ to read the whole sprotty
    [documentation](https://sprotty.org/docs/overview/).

    Additionally, sprotty requires some knowledge about the following technologies:

    - [SVG](https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial)

        Used to display the diagram elements.
        Sprotty requires all elements of a diagram to be converted
        into SVG elements, so we need to use SVG for that.
        Really only basic knowledge about the `g`, `rect`, `line`,
        and `text`.

        You can use `.tsx` files to create the SVG elements inline in TypeScript.
        For that you need to import the svg jsx wrapper from sprotty and declare that all
        inline xml-like elements are svgs using the following import:

        ```typescript
        /** @jsx svg */
        import { svg } from "sprotty";
        ```

        Sprotty uses [snabbdom](https://github.com/snabbdom/snabbdom) as the virtual DOM library.
        Refer to their documentation/README for more information on more complex SVG usage.

    - [inversify.js](https://github.com/inversify/InversifyJS)

        Used as a dependency injection framework by sprotty.
        sprotty uses this both for internal and external stuff.
        Diagram elements, sprotty configuration, custom commands, etc.
        are all registered in sprotty using inversify.js so
        we're required to use it for sprotty interaction and,
        as it is already required anyway, use it for injecting some of
        our own components too.

        To get started you should read the inversify.js [README](https://github.com/inversify/InversifyJS/blob/master/README.md)
        as well as the [Multi-injection guide](https://github.com/inversify/InversifyJS/blob/master/wiki/multi_injection.md).
        More in-depth features of inversify.js are not required for this project.

- [Font Awesome](https://fontawesome.com/)

    Used for the icons in some UIs.
    The free version is used and sufficient for this project.

## Repository structure

The repository is structured as follows:

```
.github/         # GitHub Actions workflows for Coninuous Integration
src/
    common/      # Common code module that is used by the whole application
    features/    # Feature modules of the application, more details below
    index.ts     # The main application entry point, loads all module and creates the sprotty diagram container
    page.css     # The CSS file for styling the sprotty container, make it full screen, etc.
    theme.css    # Contains CSS variables for colors with a light and dark theme
index.html       # The HTML file loaded by the browser, includes the main application entry point
package.json     # The npm package file, includes all dependencies and scripts
tsconfig.json    # TypeScript compiler settings
vite.config.ts   # Vite bundler and dev server settings
```

## Modules

The application is structured into multiple modules.
Each module is a feature of the application and is responsible for a specific part of the application.
Some features have hard dependencies on other features, other ones are independent or only
interact with other feature modules optionally, if they are present.

### Module overview

### Common

This common module contains some code adapting sprotty to our needs.
This includes:

- Adding our own custom commands to the sprotty command palette and styling it.
- General styling for UI elements
- Deleting selected elements when pressing the delete key
- Adding a "fit to screen" shortcut
- Adding the help/keyboard shortcut UI with usage instructions on the bottom left of the screen
- Fixing the browser viewport to be always at the origin, even if elements outside the viewport are focused

### Auto Layouting

Located in `src/features/autoLayout/`.

This module uses the Eclipse Layout Kernel (ELK) to automatically layout the diagram elements.
It is completely independent of the other modules and can be used with any diagram.
It adds a sprotty command to the command palette and a keyboard shortcut that invokes the ELK layouting algorithm using
the `sprotty-elk` helper provided by sprotty.

Additionally, it does some magic to run the layouting algorithm on the loaded model instead of
the model schema which is the intended use-case of the `sprotty-elk` helper.
However, we cannot do this because the size of various elements like all DFD Nodes are not
set in the model schema and unknown unless loaded.

### Copy Paste

Located in `src/features/copyPaste/`.

Allows for copying currently selected elements using `CTRL-C` and then later pasting them using `CTRL-V`.
The new elements are placed at the mouse position when pasting.

### DFD(Data-Flow Diagram) Elements

Located in `src/features/dfdElements/`.

#### Diagram Elements

This package contains the schemas, implementations and views for the DFD diagram elements.

This includes three nodes: `Storage`, `IO` and `Function`.
For edges there is a custom implementation that includes an arrow at the end and a label at the middle of the edge
that is added as a dynamic child to the edge (read below for details on dynamic children).
Has two port implementations: one for inputs and one for outputs. One can only connect an input port as the source of an edge
and an output port as the target of an edge.
Note: sprottys default behavior is to allow connections via edges between nodes if the node do not have ports.
When a node has at least one port, connections to the node directly are not allowed anymore.

#### Dynamic Children Utility

For some use-cases, most importantly editing labels, sprotty requires the use of child nodes.
A label should be inside another element and when the label or parent is double clicked one can edit the label.

You can work around this by showing the label text in the parent element svg, but this has some problems.
One of that is that the label edit UI won't have the correct position at the text, it will be at the top left of the node.
You may work around this by overriding the label edit UI to dynamically reposition it to the label text.
Some of this problems cannot be worked around, like the possibility of having two labels inside one node which
only works when using child nodes.
Another issue is with edges: positioning the label manually in the middle of the edge is more work than
adding a label as a child to the edge and letting sprotty handle the positioning.

Alternative you can do it like sprotty intends and use a child node.
This has the downside that the position and type of the child are saved in the model.
So when e.g. the position of a node changes or the sprotty element type of the label is changed,
old models will not have these changes and may break.

So to have the best of both of these possibilities, this module provides a utility to dynamically set the child nodes.
Element implementation classes can extend the `DynamicChildren*` classes and implement the `setChildren` and `removeChildren`
methods. When the model is loaded the element implementation can add the child nodes dynamically at runtime and initialize
them with values from the parent element schema. When the model is saved the element implementation can save the state from the children
to the parent element schema and remove the child elements again.
That way we have nice labels and positing from sprotty and remain flexible to changes in the element implementation.

The methods of the `DynamicChildren*` classes are recursively called on model load/save by the serialization module.

#### Output Port Behavior Editor

To define how connects through output ports are handled in the data flow analysis, the user can define the behavior
of each output port using a custom language.
This language has two main statements:

- `forward <input>(, <input>)*`: simply forwards all labels from the named input port.
  Each input port gets a name that consists of all named edges connecting to that input port. Multiple edge labels are joined using `_`.
- `set <labelType>.<labelValue> = <expr>`: sets the existence of the label value of the specified type.
  When the expression evaluates to `true`, the label value is set, otherwise it is not removed.
  Inside the expression one can use the presence of labels from other inputs using `<input>.<labelType>.<labelValue>`.
  Additionally, operators like `&&`, `||`, `!` and parentheses can be used.
  `TRUE` and `FALSE` can be used as constants.

Comments can be inserted by starting a line with `#` or `//`.
To edit the behavior of an output port, the user can double-click the output port.
This will open a popup where the current behavior definition is shown inside [monaco-editor](https://microsoft.github.io/monaco-editor/).
monaco was chosen because it is used in Visual Studio Code and therefore has a lot of features and is well maintained.

There is a tokenizer for the language defined in [monarch](https://microsoft.github.io/monaco-editor/monarch.html)
that is designed to be used with monaco.
This tokenizer is used for syntax highlighting.
There is a monaco completion provider implemented that allows for auto-completion of keywords, inputs, label types/values and constants.

#### Element Snapping

For nice positioning of elements, this module adds a snapping grid to the diagram.
By default, the grid is enabled to allow positioning elements on same heights for a nice look.
The grid can be ignored by holding the `SHIFT` key while dragging an element, this is a feature by sprotty.

This grid snapper implementation has two specialties:

- When moving or positioning ports, they are always placed on an edge of the parent node.
  Normally, sprotty would allow free placement of ports relative to the respective parent node.
  This is good for flexibility, but not what we want.
  To get our expected behavior, we compute the distance to each edge to determine the closest edge.
  One coordinate gets fixed by the selected edge and the other coordinate is snapped using a (onedimensional) grid.
- The grid size adapts per element type. Nodes have a grid size of 5, while ports have a grid size of 2.5 pixels.
  When changing these values, make sure that the bigger grid size is a multiple of the smaller grid size.
  This is necessary to ensure that ports on two nodes with different heights can be aligned to the same height..

### Editor Mode

Located in `src/features/editorMode/`.

This editor currently has three different modes:

- `edit`: The default mode, allows to view and edit the diagram. Creation of new elements is possible.
  Existing elements can be moved, modified, and deleted.
  Newly created diagrams are always in this mode.
- `view`: In this mode the diagram is read-only. The node annotations (refer to the DFD elements module)
  are displayed and can be viewed to get information about e.g. analysis validation errors.
  The user can still zoom and pan the diagram. Creation, deletion, and modification of elements is not possible.
  However the user can click a button to switch to the `edit` mode.
  Doing so will remove all node annotations and allow the user to edit the diagram again.

Diagrams with modes other than `edit` are not creatable using the editor.
Diagrams with these modes are intended to be generated from some other source.

This module contains the `EditorModeController` which manages the global editor mode.
All other modules that want to behave differently depending on the editor mode use this as a
source of truth and subscribe to changes of the editor mode.
Additionally, this module contains a UI that shows when the editor mode is not `edit`
and allows switching from `view` to `edit` mode.

### (DFD) Label

Located in `src/features/labelS/`.

Labels are metadata that can be added to any DFD diagram node.
These labels are used for the data flow analysis to ensure, e.g. that no unencrypted data is sent to an external entity.
Labels have a type and each type has one or multiple label values.
As an example, there might be the label type `Encrypted` with the following label values: `No`, `Yes`, `Partially`.

For the editor the DFD labels are used in two situations:

- On DFD nodes, where they are displayed, added and removed
- In the behavior language for output ports that are used to define whether the labels should be propagated
  over edges or be set depending on specific conditions.

This module does contain the `LabelTypeRegistry` where available label types and their values are managed.
Additionally, it provides a UI that allows to view all defined label types and values,
add new ones, remove existing ones, and edit the names of the label types and values.

### Serialization

Located in `src/features/serialization/`.

This module is responsible for loading and saving the diagram into/from a JSON file.
Loading/Saving can be invoked using the command palette or the keyboard shortcuts `CTRL-S` and `CTRL-O`.
Additionally, the default diagram, that is loaded by this module at startup, is defined here and
can be loaded at any time using the corresponding command in the command palette or the keyboard shortcut `CTRL-SHIFT-D`.
Alternatively a diagram can be loaded by dropping a JSON file into the browser tab via drag and drop from a file explorer.

The module loads/saves the sprotty model but also the current labels from the DFD Label module
and the current editor mode if those modules are present.

After loading any model, the model is fit to the screen using the sprotty FitToScreen command.
If any node does not have a position set, the auto layouting module is called to layout the diagram,
if it is loaded.
This is intended for e.g. generated diagrams where the layout is unknown and should be
automatically determined when first loaded.

### Tool Palette

Located in `src/features/toolPalette/`.

Adds the UI in the top right corner with the tools that allow creation of nodes, edges and ports.

There is one super class `CreationTool` that holds shared logic and one subclass for each tool.
In the main tool palette UI the creation tools are instanced by element type.
Additionally, there is a keyboard shortcut for each tool using the `1` to `n` keys, depending on the number of available tools.
Each creation tool has support for previewing the element before placing it,
by adding a preview element to the sprotty viewer and only adding the real element when the mouse is clicked.
The creation of a new element can be cancelled by pressing the `ESC` key.
