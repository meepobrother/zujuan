import axios from 'axios';
import { JSDOM } from 'jsdom';
import { writeFileSync, readFileSync, existsSync, ensureDirSync, writeFile } from 'fs-extra';
import { join } from 'path';

export class ZujuanUrl {
    base: string = `http://zujuan.xkw.com/`;
    loginUrl(service: string) {
        return `https://sso.zxxk.com/login?service=${encodeURIComponent(service)}`
    }
    captchaUrl() {
        const random = new Date().getTime();
        return `https://sso.zxxk.com/user/v2/captcha?_=${random}`
    }
    navUrl() {
        return `http://zujuan.xkw.com/Web/Handler1.ashx?action=categorytree&parentid=27925&iszsd=1&isinit=0`;
    }
    getGzsx() {
        return `http://zujuan.xkw.com/gzsx/zsd27925/`
    }

    getSession() {
        const session = readFileSync(join(__dirname, 'session')).toString('utf8');
        return JSON.parse(session)
    }

    isLogin() {
        return existsSync(join(__dirname, 'session'))
    }

    async getCaptcha() {
        return axios.get(this.captchaUrl()).then(res => res.data)
    }

    async getLoginParams() {
        const url = this.loginUrl(`http://zujuan.xkw.com/`);
        const html: string = await axios.get(url).then(res => res.data);
        const dom = new JSDOM(html);
        const ordinaryLoginForm = dom.window.document.getElementById('ordinaryLoginForm');
        const inputs = ordinaryLoginForm.getElementsByTagName('input')
        const res: any = {};
        for (let i = 0; i < inputs.length; i++) {
            const input = inputs[i];
            const name = input.name;
            const value = input.value;
            const id = input.id;
            if (name.length > 0) {
                res[name] = value;
            }
            if (name === 'xkw_d') {
                // 根据html匹配到
                const reg = new RegExp(`\\$\\(\\'#${id}\\'\\)\\.val\\(\\'(.*?)\\'\\);`)
                const ress = reg.exec(html);
                if (ress.length === 2) {
                    res[name] = ress[1]
                }
            }
        }
        return res;
    }

    async login(username: string, password: string) {
        if (!this.isLogin()) {
            const url = this.loginUrl(`http://zujuan.xkw.com/`);
            const params = await this.getLoginParams();
            const headers = {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3770.100 Safari/537.36",
                "Origin": "https://sso.zxxk.com",
                "Referer": "https://sso.zxxk.com/login?service=http%3A%2F%2Fzujuan.xkw.com%2F"
            };
            return axios.post(url, {
                ...params,
                username,
                password
            }, { headers }).then(res => {
                const session = res.headers['set-cookie'];
                writeFileSync(join(__dirname, 'session'), JSON.stringify(session));
                return session;
            });
        } else {
            return this.getSession();
        }
    }

    async getHeaders(username: string, password: string) {
        return {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3770.100 Safari/537.36",
            Cookie: await this.login(username, password)
        }
    }
    async getIndex(username: string, password: string) {
        const url = `http://zujuan.xkw.com/`;
        const html: string = await axios.get(url, {
            headers: this.getHeaders(username, password)
        }).then(res => res.data);
        writeFileSync(join(__dirname, 'index.html'), html);
        // 获取userinfo
        const dom = new JSDOM(html);
        const cache = dom.window.document.getElementById('ctl00_cache');
        const script = cache.getElementsByTagName('script')[0];
        const scriptContent = script.innerHTML;
        const context = scriptContent.replace(/var (.*?)=/gi, 'export const $1=').split(';').join(';\n');
        writeFileSync(join(__dirname, 'ctl00_cache.ts'), `${context}`);
        const navBar = dom.window.document.getElementById('navBar');
        const submenu = navBar.getElementsByClassName('submenu')[0];
        // 获取分类
        const category: Category[] = [];
        for (let i = 0; i < submenu.children.length; i++) {
            const child = submenu.children[i];
            const h2 = child.getElementsByTagName('h2')[0];
            const lis = child.getElementsByTagName('li');
            if (h2 && lis) {
                const res: Category = {
                    title: h2.innerHTML,
                    list: []
                }
                for (let j = 0; j < lis.length; j++) {
                    const li = lis[j];
                    res.list.push({
                        title: li.innerHTML,
                        data: li.attributes.getNamedItem('data').value
                    })
                }
                ensureDirSync(join(__dirname, res.title))
                res.list.map(li => {
                    const dir = join(__dirname, res.title, li.title)
                    ensureDirSync(dir);
                    writeFileSync(join(dir, 'params.json'), JSON.stringify(li, null, 2))
                });
                category.push(res)
            }
        }
        writeFileSync(join(__dirname, 'category.json'), JSON.stringify(category, null, 2));
    }
}

export interface Category {
    title: string;
    list: {
        title: string;
        data: string;
    }[];
}