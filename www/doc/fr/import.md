Implémentation de _import_
--------------------------

Vous pouvez installer des modules ou des paquetages Python dans votre
application, en les mettant à la racine de l'application ou dans des
répertoires comportant un fichier __\_\_init\_\_.py__.

Noter que les modules doivent être encodés en utf-8 ; la déclaration
d'encodage en début de module n'est pas prise en compte.

Par exemple l'application peut être composée des fichiers et répertoires
suivants :

    app.html
    brython.js
    brython_modules.js
    brython_stdlib.js
    index.html
    users.py
    utils.py
    + app
        __init__.py
        records.py
        tables.py

Un script Python dans __app.html__ peut exécuter les imports

```python
import users
import app.records
```

**Avertissement** : _ceci ne fonctionne pas si le script est ouvert dans le_
_navigateur par le menu Fichier / Ouvrir_. En effet, comme le navigateur n'a
pas accès directement au système de fichiers, les modules sont chargés par un
appel Ajax, et les appels Ajax ne sont pas possibles quand la page est ouverte
de cette façon.

Pour que ces imports fonctionnent, il faut ouvrir la page en lançant un
serveur web permettant d'accéder à la page. Pour des tests en local, il suffit
d'exécuter `python -m http.server` dans le répertoire où se trouve la page et
de saisir _localhost:8000/app.html_ dans la barre d'adresse du navigateur.

Si la bibliothèque standard a été insérée dans la page par

```xml
<script type="text/javascript" src="brython_stdlib.js"></script>
```

le script peut aussi exécuter

```python
import datetime
import re
```

Pour importer des modules ou des paquetages, Brython utilise le même mécanisme
que CPython : pour résoudre "import X", le programme recherche un fichier dans
plusieurs emplacements :

- un module __X__ dans la bibliothèque standard
- un fichier __X.py__ dans le répertoire courant
- un fichier __\_\_init\_\_.py__ dans le sous-répertoire __X__ du répertoire
  courant
- un fichier __X.py__ dans le répertoire __site-packages__ de la bibliothèque
  standard
- un fichier __\_\_init.py\_\___ dans le répertoire __site-packages/X__ de la 
  bibliothèque standard

En outre, si une page HTML comporte plusieurs scripts Brython, ceux qui sont
déjà exécutés peuvent être importés par leur `id`:

```xml
<script type="text/python" id="module">
def hello():
    return "world"
</script>

<script type="text/python">
from browser import document
import module

document.body <= module.hello()
</script>
```

Optimisation
============
Le mécanisme décrit ci-dessus présente deux inconvénients :

- la taille assez importante de __brython_stdlib.js__ (plus de 4 Mo)
- le temps pris par les appels Ajax

Pour optimiser les imports, si Brython a été installé par `pip`, vous pouvez
générer un fichier __brython_modules.js__ qui ne contient que les modules
utilisés par l'application.

Pour cela il faut ouvrir une console système, se positionner dans le
répertoire de l'application, et exécuter

```console
brython-cli make_modules
```

A noter que ce programme analyse le code Brython contenu dans tous les scripts,
modules et pages HTML qui se trouvent dans le répertoire et ses
sous-répertoires. La version de CPython utilisée doit donc être compatible
avec le code Brython : par exemple si ce code inclut des `match / case`, il
faut au minimum CPython 3.10, sinon le programme détectera des erreurs de
syntaxe.

Vous pouvez ensuite remplacer toutes les occurrences de

```xml
<script type="text/javascript" src="brython_stdlib.js"></script>
```
par
```xml
<script type="text/javascript" src="brython_modules.js"></script>
```
