# Jacob Gong — Personal Homepage

Built with Jekyll, hosted on GitHub Pages at [jacobgit2.github.io](https://jacobgit2.github.io).

## Day-to-day edits

| Task | What to do |
|------|------------|
| **Add a news item** | Edit `_data/news.yml` — add `- date: "..." text: "..."` at the top |
| **Add a publication** | Edit `_data/publications.yml` — add title, authors, venue, year, url |
| **Add a project** | Create a new `.md` file in `_projects/` with front matter (title, tags, date, github, excerpt_text) |
| **Write a blog post** | Create `YYYY-MM-DD-title.md` in `_posts/` with front matter (title, tags) |
| **Update CV** | Replace `CV.pdf` in root |
| **Change photo** | Replace `assets/img/photo.jpg` |

## Local preview

```bash
bundle install
bundle exec jekyll serve
# Open http://localhost:4000
```
